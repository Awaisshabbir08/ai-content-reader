"""Evaluation helpers. Convention: lower score = more AI-like; label 1 = AI, 0 = human."""

import numpy as np


def auroc(ai_scores: list[float], human_scores: list[float]) -> float:
    """Probability that a random AI text scores lower than a random human text."""
    ai = np.asarray(ai_scores)[:, None]
    human = np.asarray(human_scores)[None, :]
    return float(np.mean((ai < human) + 0.5 * (ai == human)))


def threshold_at_fpr(human_scores: list[float], target_fpr: float) -> float:
    """Largest threshold that labels at most `target_fpr` of human texts as AI (score < t)."""
    h = np.sort(np.asarray(human_scores))
    k = int(np.floor(target_fpr * len(h)))
    return float(h[min(k, len(h) - 1)])


def threshold_at_fnr(ai_scores: list[float], target_fnr: float) -> float:
    """Smallest threshold that lets at most `target_fnr` of AI texts be labelled human (score > t)."""
    a = np.sort(np.asarray(ai_scores))[::-1]
    k = int(np.floor(target_fnr * len(a)))
    return float(a[min(k, len(a) - 1)])


def weighted_threshold_at_fpr(human_scores: list[float], weights: list[float], target_fpr: float) -> float:
    """Like threshold_at_fpr, but at most `target_fpr` of the human *weight* (e.g. words) falls below t."""
    order = np.argsort(human_scores, kind="stable")
    s = np.asarray(human_scores, dtype=float)[order]
    w = np.asarray(weights, dtype=float)[order]
    share_below = np.concatenate([[0.0], np.cumsum(w)[:-1] / w.sum()])  # weight strictly below s[k]
    return float(s[np.nonzero(share_below <= target_fpr + 1e-12)[0].max()])


def weighted_threshold_at_fnr(ai_scores: list[float], weights: list[float], target_fnr: float) -> float:
    """Like threshold_at_fnr, but at most `target_fnr` of the AI *weight* lies above t."""
    order = np.argsort(ai_scores, kind="stable")[::-1]
    s = np.asarray(ai_scores, dtype=float)[order]
    w = np.asarray(weights, dtype=float)[order]
    share_above = np.concatenate([[0.0], np.cumsum(w)[:-1] / w.sum()])
    return float(s[np.nonzero(share_above <= target_fnr + 1e-12)[0].max()])


def rates(ai_scores: list[float], human_scores: list[float], ai_below: float, human_above: float) -> dict:
    ai = np.asarray(ai_scores)
    human = np.asarray(human_scores)
    return {
        "tpr": float(np.mean(ai < ai_below)),  # AI texts correctly flagged
        "fpr": float(np.mean(human < ai_below)),  # human texts wrongly flagged as AI
        "human_recall": float(np.mean(human > human_above)),
        "ai_called_human": float(np.mean(ai > human_above)),
        "uncertain": float(
            (np.sum((ai >= ai_below) & (ai <= human_above)) + np.sum((human >= ai_below) & (human <= human_above)))
            / (len(ai) + len(human))
        ),
    }


def fit_platt(scores: list[float], labels: list[int], l2: float = 1e-2, iters: int = 100) -> tuple[float, float]:
    """Fit P(AI) = sigmoid(a * score + b) by regularised Newton's method. Returns (a, b)."""
    x = np.asarray(scores, dtype=float)
    y = np.asarray(labels, dtype=float)
    mu, sd = x.mean(), x.std() or 1.0
    X = np.stack([(x - mu) / sd, np.ones_like(x)], axis=1)
    w = np.zeros(2)
    reg = np.diag([l2, 0.0])
    for _ in range(iters):
        p = 1.0 / (1.0 + np.exp(-(X @ w)))
        grad = X.T @ (p - y) + reg @ w
        hess = X.T @ (X * (p * (1 - p))[:, None]) + reg + 1e-9 * np.eye(2)
        step = np.linalg.solve(hess, grad)
        w -= step
        if np.abs(step).max() < 1e-10:
            break
    return float(w[0] / sd), float(w[1] - w[0] * mu / sd)
