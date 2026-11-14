import math

import numpy as np
import pytest

from app.detector.metrics import auroc, fit_platt, rates, threshold_at_fnr, threshold_at_fpr


def test_auroc_perfect_random_and_inverted():
    assert auroc([0.1, 0.2], [0.8, 0.9]) == 1.0
    assert auroc([0.5, 0.5], [0.5, 0.5]) == 0.5
    assert auroc([0.8, 0.9], [0.1, 0.2]) == 0.0


def test_threshold_at_fpr_keeps_false_positives_under_target():
    human = list(np.linspace(0.80, 1.0, 200))
    t = threshold_at_fpr(human, 0.01)
    assert np.mean(np.asarray(human) < t) <= 0.01


def test_threshold_at_fnr_keeps_missed_ai_under_target():
    ai = list(np.linspace(0.5, 0.9, 100))
    t = threshold_at_fnr(ai, 0.05)
    assert np.mean(np.asarray(ai) > t) <= 0.05


def test_rates():
    r = rates(ai_scores=[0.5, 0.6, 0.85], human_scores=[0.95, 1.0, 0.8], ai_below=0.7, human_above=0.9)
    assert r["tpr"] == pytest.approx(2 / 3)
    assert r["fpr"] == 0
    assert r["human_recall"] == pytest.approx(2 / 3)
    assert r["uncertain"] == pytest.approx(2 / 6)


def test_platt_gives_higher_ai_probability_to_lower_scores():
    rng = np.random.default_rng(0)
    ai = rng.normal(0.7, 0.05, 300)
    human = rng.normal(0.9, 0.05, 300)
    a, b = fit_platt(list(ai) + list(human), [1] * 300 + [0] * 300)
    p = lambda s: 1 / (1 + math.exp(-(a * s + b)))  # noqa: E731
    assert a < 0
    assert p(0.6) > 0.95 and p(1.0) < 0.05
    assert p(0.8) == pytest.approx(0.5, abs=0.1)  # midpoint of the two classes


def test_weighted_thresholds_count_weight_not_items():
    from app.detector.metrics import weighted_threshold_at_fnr, weighted_threshold_at_fpr

    # Two short human sentences (1 word each) may be flagged: together 2% of the words.
    t = weighted_threshold_at_fpr([0.5, 0.6, 0.9, 1.0], [1, 1, 1, 97], 0.02)
    assert t == 0.9
    # AI words above t: only the 1-word sentence at 0.95 (1% of words) is allowed through.
    t = weighted_threshold_at_fnr([0.5, 0.6, 0.7, 0.95], [50, 30, 19, 1], 0.01)
    assert t == 0.7


def test_weighted_thresholds_match_unweighted_with_equal_weights():
    import numpy as np

    from app.detector.metrics import threshold_at_fnr, threshold_at_fpr
    from app.detector.metrics import weighted_threshold_at_fnr, weighted_threshold_at_fpr

    scores = list(np.random.default_rng(0).normal(size=137))
    ones = [1] * len(scores)
    assert weighted_threshold_at_fpr(scores, ones, 0.05) == threshold_at_fpr(scores, 0.05)
    assert weighted_threshold_at_fnr(scores, ones, 0.05) == threshold_at_fnr(scores, 0.05)
