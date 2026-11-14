import math

import pytest
import torch
import torch.nn.functional as F

from app.detector.binoculars import binoculars_score, token_stats


def test_token_stats_match_reference_formulas():
    torch.manual_seed(0)
    observer = torch.randn(6, 11)
    performer = torch.randn(6, 11)
    ids = torch.randint(0, 11, (6,))

    nll, xent = token_stats(observer, performer, ids)

    expected_nll = F.cross_entropy(performer[:-1], ids[1:], reduction="none")
    expected_xent = F.cross_entropy(performer[:-1], F.softmax(observer[:-1], -1), reduction="none")
    assert torch.allclose(nll, expected_nll, atol=1e-5)
    assert torch.allclose(xent, expected_xent, atol=1e-5)


def test_identical_models_give_entropy_as_cross_entropy():
    logits = torch.randn(5, 7)
    _, xent = token_stats(logits, logits, torch.zeros(5, dtype=torch.long))
    p = F.softmax(logits[:-1], -1)
    entropy = -(p * p.log()).sum(-1)
    assert torch.allclose(xent, entropy, atol=1e-5)


def test_mismatched_vocab_sizes_are_truncated_to_shared_part():
    nll, xent = token_stats(torch.randn(4, 10), torch.randn(4, 12), torch.tensor([1, 2, 3, 4]))
    assert nll.shape == xent.shape == (3,)
    assert torch.isfinite(nll).all() and torch.isfinite(xent).all()


def test_predictable_text_scores_lower_than_surprising_text():
    vocab = 5
    ids = torch.tensor([0, 1, 2, 3, 4])
    confident = torch.full((5, vocab), -5.0)
    confident[torch.arange(4), ids[1:]] = 5.0  # the models expect exactly these tokens
    flat = torch.zeros(5, vocab)  # the models have no preference

    low = binoculars_score(*map(torch.Tensor.tolist, token_stats(flat, confident, ids)))
    high = binoculars_score(*map(torch.Tensor.tolist, token_stats(flat, flat, ids)))
    assert low < high
    assert high == pytest.approx(1.0)  # uniform: nll = xent = log(vocab)
    assert math.isfinite(low)
