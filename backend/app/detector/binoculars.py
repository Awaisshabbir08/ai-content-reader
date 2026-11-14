"""Binoculars zero-shot AI-text detector (Hans et al., 2024, arXiv:2401.12070).

Score = log-perplexity of the text under the performer model, divided by the
cross-perplexity between the observer and performer models. AI-generated text
gets a LOW score; human text gets a HIGH score. No training is needed, but the
decision thresholds depend on the model pair, so they come from calibration.json
(see scripts/calibrate.py).
"""

import threading
from collections.abc import Callable
from dataclasses import dataclass

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


@dataclass
class TokenScores:
    """Per-token statistics for every scored token of the text."""

    nll: list[float]  # performer negative log-likelihood of the actual token
    xent: list[float]  # cross-entropy: observer probabilities vs performer log-probs
    spans: list[tuple[int, int]]  # character span of each scored token
    total_tokens: int  # tokens in the full text, before truncation
    truncated: bool


def token_stats(
    observer_logits: torch.Tensor, performer_logits: torch.Tensor, input_ids: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """Per-token NLL and cross-entropy for a single sequence.

    observer_logits / performer_logits: [T, V]; input_ids: [T].
    Returns two tensors of length T-1, one value per predicted token (positions 1..T-1).
    """
    vocab = min(observer_logits.shape[-1], performer_logits.shape[-1])
    observer = observer_logits[:-1, :vocab].float()
    performer = performer_logits[:-1, :vocab].float()
    targets = input_ids[1:]

    performer_logp = torch.log_softmax(performer, dim=-1)
    nll = -performer_logp.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
    xent = -(torch.softmax(observer, dim=-1) * performer_logp).sum(-1)
    return nll, xent


def aligned_token_stats(
    observer_logits: torch.Tensor, performer_logits: torch.Tensor, targets: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """Like token_stats, but logits[i] already predicts targets[i] (no shift)."""
    vocab = min(observer_logits.shape[-1], performer_logits.shape[-1])
    performer_logp = torch.log_softmax(performer_logits[:, :vocab].float(), dim=-1)
    nll = -performer_logp.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
    xent = -(torch.softmax(observer_logits[:, :vocab].float(), dim=-1) * performer_logp).sum(-1)
    return nll, xent


def binoculars_score(nll: list[float], xent: list[float]) -> float:
    """mean(nll) / mean(xent) over the same tokens."""
    return sum(nll) / sum(xent)


# Progress callback: (tokens scored so far, tokens to score).
Progress = Callable[[int, int], None]

# The vocabulary projection is computed this many positions at a time. With a 150k-token
# vocabulary, full [512, V] float32 logits for two models (plus softmax buffers) need over
# 1 GB; slicing keeps the peak under ~250 MB and gives the same numbers.
HEAD_SLICE = 128


class BinocularsDetector:
    def __init__(
        self,
        observer_model: str,
        performer_model: str,
        device: str = "auto",
        max_tokens: int = 2048,
        window_tokens: int = 512,
    ) -> None:
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.max_tokens = max_tokens
        self.window_tokens = window_tokens
        self.context_tokens = min(64, window_tokens // 4)
        self.name = f"binoculars:{observer_model}|{performer_model}"

        self.tokenizer = AutoTokenizer.from_pretrained(observer_model)
        performer_tokenizer = AutoTokenizer.from_pretrained(performer_model)
        if self.tokenizer.get_vocab() != performer_tokenizer.get_vocab():
            raise ValueError("Observer and performer models must share the same tokenizer.")

        dtype = torch.bfloat16 if device == "cuda" else torch.float32
        self.observer = self._load(observer_model, dtype)
        self.performer = self._load(performer_model, dtype)
        self._lock = threading.Lock()  # one inference at a time; the models are not re-entrant

    def _load(self, name: str, dtype: torch.dtype):
        model = AutoModelForCausalLM.from_pretrained(name, dtype=dtype)
        return model.to(self.device).eval()

    def score_tokens(self, text: str, progress: Progress | None = None) -> TokenScores:
        enc = self.tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
        total = len(enc["input_ids"])
        ids = enc["input_ids"][: self.max_tokens]
        offsets = [tuple(o) for o in enc["offset_mapping"][: self.max_tokens]]

        nll_all: list[float] = []
        xent_all: list[float] = []
        spans: list[tuple[int, int]] = []

        # Score the text in windows. Each window also sees `context_tokens` of the
        # previous window, so tokens at a window boundary still have left context.
        stride = self.window_tokens - self.context_tokens
        with self._lock, torch.inference_mode():
            for start in range(0, len(ids), stride):
                end = min(start + stride, len(ids))
                begin = max(0, start - self.context_tokens)
                chunk = torch.tensor([ids[begin:end]], device=self.device)
                if chunk.shape[1] < 2:
                    continue
                # Position p predicts token p+1; keep predictions for tokens first..end-1.
                first = max(start, 1)
                nll, xent = self._window_stats(chunk[0], first - begin - 1)
                nll_all.extend(nll)
                xent_all.extend(xent)
                spans.extend(offsets[first:end])
                if progress is not None:
                    progress(end, len(ids))

        return TokenScores(nll_all, xent_all, spans, total_tokens=total, truncated=total > len(ids))

    def _window_stats(self, chunk: torch.Tensor, keep_from: int) -> tuple[list[float], list[float]]:
        """NLL and cross-entropy for predictions keep_from..len(chunk)-2 of one window."""
        obs_hidden = self.observer.base_model(input_ids=chunk[None]).last_hidden_state[0]
        perf_hidden = self.performer.base_model(input_ids=chunk[None]).last_hidden_state[0]
        obs_head = self.observer.get_output_embeddings()
        perf_head = self.performer.get_output_embeddings()
        nll_out: list[float] = []
        xent_out: list[float] = []
        last = chunk.shape[0] - 1  # number of predictions in the window
        for s in range(keep_from, last, HEAD_SLICE):
            e = min(s + HEAD_SLICE, last)
            nll, xent = aligned_token_stats(
                obs_head(obs_hidden[s:e]), perf_head(perf_hidden[s:e]), chunk[s + 1 : e + 1]
            )
            nll_out.extend(nll.tolist())
            xent_out.extend(xent.tolist())
        return nll_out, xent_out
