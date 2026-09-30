import numpy as np

from bench import score


def test_summarize_reports_mean_max_and_min():
    pairs = [dict(lpips=0.01, psnr=40.0, ssim=0.99, image_reward=1.0, pixels_identical=False, alpha_max_abs=0),
             dict(lpips=0.03, psnr=30.0, ssim=0.97, image_reward=0.5, pixels_identical=False, alpha_max_abs=2)]
    s = score.summarize(pairs)
    assert s["lpips"] == {"mean": 0.02, "max": 0.03}
    assert s["psnr"] == {"mean": 35.0, "min": 30.0}
    assert s["ssim"] == {"mean": 0.98}
    assert s["imageReward"] == {"mean": 0.75}
    assert s["alpha_max_abs"] == 2 and s["n"] == 2


def test_summarize_baseline_has_only_image_reward():
    s = score.summarize([dict(image_reward=0.2), dict(image_reward=0.4)])
    assert "lpips" not in s and s["imageReward"] == {"mean": 0.3}


def test_psnr_of_identical_is_infinite_and_excluded_from_mean():
    a = np.zeros((4, 4, 3), np.uint8)
    assert score.psnr(a, a) == float("inf")
    s = score.summarize([dict(lpips=0.0, psnr=float("inf"), ssim=1.0), dict(lpips=0.1, psnr=20.0, ssim=0.9)])
    assert s["psnr"] == {"mean": 20.0, "min": 20.0}


def test_composite_flattens_alpha_onto_white(tmp_path):
    from PIL import Image
    Image.fromarray(np.zeros((2, 2, 4), np.uint8)).save(tmp_path / "a.png")  # fully transparent black
    rgb, alpha = score.composite(tmp_path / "a.png")
    assert rgb.tolist() == [[[255, 255, 255]] * 2] * 2 and alpha.max() == 0
