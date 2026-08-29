"""
LunaReg Standalone Computer-Vision Registration Engine (SIH26166)
================================================================
Robust geometric image registration for lunar surface optical imagery.
Implements SIFT feature detection, FLANN/Lowe-ratio matching,
epipolar RANSAC homography estimation, perspective warping,
and quantitative error residual mapping.
"""

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


def load_image(image_path: str) -> np.ndarray:
    """
    Load and validate an image from the filesystem.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError(f"Failed to decode image raster: {image_path}")
    
    return image


def preprocess_image(
    image: np.ndarray, clip_limit: float = 3.0, tile_grid_size: Tuple[int, int] = (8, 8)
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Convert image to grayscale and apply Contrast Limited Adaptive Histogram Equalization (CLAHE)
    to normalize dynamic range and enhance crater rim/shadow contrast.
    """
    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
        
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    enhanced = clahe.apply(gray)
    return gray, enhanced


def detect_features(
    image: np.ndarray, max_features: int = 2000
) -> Tuple[List[cv2.KeyPoint], Optional[np.ndarray]]:
    """
    Extract Scale-Invariant Feature Transform (SIFT) keypoints and descriptors.
    """
    sift = cv2.SIFT_create(nfeatures=max_features)
    keypoints, descriptors = sift.detectAndCompute(image, None)
    
    if keypoints is None:
        keypoints = []
        
    return keypoints, descriptors


def match_features(
    descriptors_ref: Optional[np.ndarray],
    descriptors_target: Optional[np.ndarray],
    method: str = "flann",
) -> List[List[cv2.DMatch]]:
    """
    Perform k-Nearest Neighbor (k=2) descriptor matching using FLANN or Brute-Force Matcher.
    """
    if (
        descriptors_ref is None
        or descriptors_target is None
        or len(descriptors_ref) < 2
        or len(descriptors_target) < 2
    ):
        return []
    
    if method == "flann":
        flann_index_kdtree = 1
        index_params = dict(algorithm=flann_index_kdtree, trees=5)
        search_params = dict(checks=50)
        matcher = cv2.FlannBasedMatcher(index_params, search_params)
    else:
        matcher = cv2.BFMatcher(cv2.NORM_L2)
        
    try:
        matches = matcher.knnMatch(descriptors_ref, descriptors_target, k=2)
    except Exception:
        bf = cv2.BFMatcher(cv2.NORM_L2)
        matches = bf.knnMatch(descriptors_ref, descriptors_target, k=2)
        
    return matches


def filter_matches(
    matches: List[List[cv2.DMatch]], ratio_threshold: float = 0.75
) -> List[cv2.DMatch]:
    """
    Apply Lowe's second-nearest-neighbor distance ratio test.
    """
    good_matches: List[cv2.DMatch] = []
    for match_pair in matches:
        if len(match_pair) == 2:
            m, n = match_pair
            if m.distance < ratio_threshold * n.distance:
                good_matches.append(m)
    return good_matches


def estimate_homography(
    keypoints_ref: List[cv2.KeyPoint],
    keypoints_target: List[cv2.KeyPoint],
    matches: List[cv2.DMatch],
    ransac_threshold: float = 3.0,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], np.ndarray, np.ndarray]:
    """
    Estimate projective 3x3 Homography H relating target image coordinates to reference image coordinates
    using RANSAC outlier elimination.
    Mapping direction: x_ref = H * x_target
    """
    if len(matches) < 4:
        return None, None, np.empty((0, 1, 2), dtype=np.float32), np.empty((0, 1, 2), dtype=np.float32)
    
    # Query is Reference, Train is Target
    dst_pts = np.float32([keypoints_ref[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    src_pts = np.float32([keypoints_target[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, ransac_threshold)
    
    inlier_mask = mask.ravel() if mask is not None else None
    return H, inlier_mask, src_pts, dst_pts


def calculate_reprojection_error(
    src_pts: np.ndarray,
    dst_pts: np.ndarray,
    H: Optional[np.ndarray],
    inlier_mask: Optional[np.ndarray],
) -> Tuple[float, float, List[float]]:
    """
    Calculate true Root Mean Square Error (RMSE) and maximum reprojection error
    for the verified RANSAC inlier set.
    """
    if (
        H is None
        or inlier_mask is None
        or len(src_pts) == 0
        or np.sum(inlier_mask) == 0
    ):
        return 0.0, 0.0, []
    
    mask_bool = inlier_mask.astype(bool)
    inlier_src = src_pts[mask_bool]
    inlier_dst = dst_pts[mask_bool]
    
    # Reproject target points into reference frame: x_proj = H * x_target
    projected_pts = cv2.perspectiveTransform(inlier_src, H)
    
    # Euclidean distance ||x_dst - x_proj||_2
    errors = np.linalg.norm(inlier_dst - projected_pts, axis=2).ravel()
    
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    max_error = float(np.max(errors))
    return rmse, max_error, errors.tolist()


def warp_image(
    target_image: np.ndarray, H: np.ndarray, ref_dimensions: Tuple[int, int]
) -> np.ndarray:
    """
    Warp the target image onto the reference image coordinate canvas.
    """
    width, height = ref_dimensions
    warped = cv2.warpPerspective(
        target_image,
        H,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )
    return warped


def create_match_visualization(
    ref_image: np.ndarray,
    target_image: np.ndarray,
    keypoints_ref: List[cv2.KeyPoint],
    keypoints_target: List[cv2.KeyPoint],
    matches: List[cv2.DMatch],
    inlier_mask: Optional[np.ndarray],
) -> np.ndarray:
    """
    Generate a high-clarity side-by-side match correspondence visualization
    distinguishing verified inliers (solid green) from rejected outliers (dashed red).
    """
    h1, w1 = ref_image.shape[:2]
    h2, w2 = target_image.shape[:2]
    
    out_h = max(h1, h2)
    out_w = w1 + w2
    
    # Create composite canvas
    composite = np.zeros((out_h, out_w, 3), dtype=np.uint8)
    composite[:h1, :w1] = ref_image
    composite[:h2, w1:w1 + w2] = target_image
    
    # Draw vertical separator
    cv2.line(composite, (w1, 0), (w1, out_h), (80, 80, 80), 2)
    
    inliers_count = 0
    outliers_count = 0
    
    # Draw match lines: Outliers first (so inliers render cleanly on top)
    for i, m in enumerate(matches):
        is_inlier = bool(inlier_mask[i]) if (inlier_mask is not None and i < len(inlier_mask)) else False
        if not is_inlier:
            outliers_count += 1
            pt1 = (int(round(keypoints_ref[m.queryIdx].pt[0])), int(round(keypoints_ref[m.queryIdx].pt[1])))
            pt2 = (int(round(keypoints_target[m.trainIdx].pt[0])) + w1, int(round(keypoints_target[m.trainIdx].pt[1])))
            cv2.line(composite, pt1, pt2, (0, 0, 220), 1, lineType=cv2.LINE_AA)
            
    # Draw inliers
    for i, m in enumerate(matches):
        is_inlier = bool(inlier_mask[i]) if (inlier_mask is not None and i < len(inlier_mask)) else False
        if is_inlier:
            inliers_count += 1
            pt1 = (int(round(keypoints_ref[m.queryIdx].pt[0])), int(round(keypoints_ref[m.queryIdx].pt[1])))
            pt2 = (int(round(keypoints_target[m.trainIdx].pt[0])) + w1, int(round(keypoints_target[m.trainIdx].pt[1])))
            cv2.line(composite, pt1, pt2, (0, 220, 50), 2, lineType=cv2.LINE_AA)
            
    # Draw keypoint dots
    for kp in keypoints_ref:
        pt = (int(round(kp.pt[0])), int(round(kp.pt[1])))
        cv2.circle(composite, pt, 3, (255, 180, 0), -1, lineType=cv2.LINE_AA)  # Cyan/Blue-ish
        cv2.circle(composite, pt, 4, (120, 80, 0), 1, lineType=cv2.LINE_AA)
        
    for kp in keypoints_target:
        pt = (int(round(kp.pt[0])) + w1, int(round(kp.pt[1])))
        cv2.circle(composite, pt, 3, (0, 165, 255), -1, lineType=cv2.LINE_AA)  # Amber/Orange
        cv2.circle(composite, pt, 4, (0, 90, 180), 1, lineType=cv2.LINE_AA)
        
    # Top Annotation Banner
    banner = np.zeros((40, out_w, 3), dtype=np.uint8)
    banner[:] = (20, 20, 24)
    
    cv2.putText(
        banner,
        f"REFERENCE ({w1}x{h1})",
        (16, 26),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 200, 0),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"TARGET ({w2}x{h2})",
        (w1 + 16, 26),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 180, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"Inliers: {inliers_count} (Green) | Outliers: {outliers_count} (Red)",
        (max(16, out_w - 480), 26),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (200, 200, 200),
        1,
        cv2.LINE_AA,
    )
    
    return np.vstack([banner, composite])


def create_overlay(
    ref_image: np.ndarray, warped_target: np.ndarray, alpha: float = 0.5
) -> np.ndarray:
    """
    Generate an alpha-blended overlay image of the reference and registered target.
    """
    return cv2.addWeighted(ref_image, 1.0 - alpha, warped_target, alpha, 0)


def create_difference_image(
    ref_image: np.ndarray, warped_target: np.ndarray
) -> np.ndarray:
    """
    Generate a pseudo-color residual error heatmap showing pixel intensity differences
    between reference and registered target within the overlapping footprint.
    """
    ref_gray = cv2.cvtColor(ref_image, cv2.COLOR_BGR2GRAY) if len(ref_image.shape) == 3 else ref_image
    warped_gray = cv2.cvtColor(warped_target, cv2.COLOR_BGR2GRAY) if len(warped_target.shape) == 3 else warped_target
    
    diff = cv2.absdiff(ref_gray, warped_gray)
    scaled_diff = cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    heatmap = cv2.applyColorMap(scaled_diff, cv2.COLORMAP_JET)
    
    valid_mask = warped_gray > 0
    heatmap[~valid_mask] = (15, 15, 20)
    
    return heatmap


def save_metrics(metrics: Dict[str, Any], output_path: str) -> None:
    """
    Save registration metrics to a formatted JSON file.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)


def run_pipeline(
    reference_path: str,
    target_path: str,
    ratio_threshold: float = 0.75,
    ransac_threshold: float = 3.0,
    max_features: int = 2000,
    output_dir: str = "output",
) -> Tuple[bool, Dict[str, Any]]:
    """
    Execute the end-to-end computer-vision registration workflow.
    """
    start_time = time.perf_counter()
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Load Images
    ref_img = load_image(reference_path)
    tgt_img = load_image(target_path)
    
    ref_h, ref_w = ref_img.shape[:2]
    tgt_h, tgt_w = tgt_img.shape[:2]
    
    # 2. Grayscale & CLAHE Preprocessing
    _, ref_enhanced = preprocess_image(ref_img)
    _, tgt_enhanced = preprocess_image(tgt_img)
    
    # 3. Detect SIFT Features & Compute Descriptors
    kp_ref, des_ref = detect_features(ref_enhanced, max_features=max_features)
    kp_tgt, des_tgt = detect_features(tgt_enhanced, max_features=max_features)
    
    ref_kp_count = len(kp_ref)
    tgt_kp_count = len(kp_tgt)
    
    # Check if features were extracted
    if ref_kp_count == 0 or tgt_kp_count == 0 or des_ref is None or des_tgt is None:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics: Dict[str, Any] = {
            "status": "failed",
            "error_message": "Insufficient feature keypoints detected in one or both images.",
            "reference_width": ref_w,
            "reference_height": ref_h,
            "target_width": tgt_w,
            "target_height": tgt_h,
            "reference_keypoints": ref_kp_count,
            "target_keypoints": tgt_kp_count,
            "initial_matches": 0,
            "good_matches": 0,
            "inlier_matches": 0,
            "inlier_ratio": 0.0,
            "reprojection_rmse": 0.0,
            "max_reprojection_error": 0.0,
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics
    
    # 4. Feature Matching
    raw_matches = match_features(des_ref, des_tgt, method="flann")
    initial_matches_count = len(raw_matches)
    
    # 5. Lowe's Ratio Test Filtering
    good_matches = filter_matches(raw_matches, ratio_threshold=ratio_threshold)
    good_matches_count = len(good_matches)
    
    if good_matches_count < 4:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": f"Insufficient geometric correspondences after ratio test ({good_matches_count} < 4).",
            "reference_width": ref_w,
            "reference_height": ref_h,
            "target_width": tgt_w,
            "target_height": tgt_h,
            "reference_keypoints": ref_kp_count,
            "target_keypoints": tgt_kp_count,
            "initial_matches": initial_matches_count,
            "good_matches": good_matches_count,
            "inlier_matches": 0,
            "inlier_ratio": 0.0,
            "reprojection_rmse": 0.0,
            "max_reprojection_error": 0.0,
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics
    
    # 6. RANSAC Homography Estimation
    H, inlier_mask, src_pts, dst_pts = estimate_homography(
        kp_ref, kp_tgt, good_matches, ransac_threshold=ransac_threshold
    )
    
    if H is None or inlier_mask is None:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": "RANSAC failed to compute a stable homography matrix.",
            "reference_width": ref_w,
            "reference_height": ref_h,
            "target_width": tgt_w,
            "target_height": tgt_h,
            "reference_keypoints": ref_kp_count,
            "target_keypoints": tgt_kp_count,
            "initial_matches": initial_matches_count,
            "good_matches": good_matches_count,
            "inlier_matches": 0,
            "inlier_ratio": 0.0,
            "reprojection_rmse": 0.0,
            "max_reprojection_error": 0.0,
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics
    
    inliers_count = int(np.sum(inlier_mask))
    inlier_ratio = round((inliers_count / good_matches_count) * 100, 2) if good_matches_count > 0 else 0.0
    
    if inliers_count < 4:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": f"Too few inliers retained after RANSAC ({inliers_count} < 4).",
            "reference_width": ref_w,
            "reference_height": ref_h,
            "target_width": tgt_w,
            "target_height": tgt_h,
            "reference_keypoints": ref_kp_count,
            "target_keypoints": tgt_kp_count,
            "initial_matches": initial_matches_count,
            "good_matches": good_matches_count,
            "inlier_matches": inliers_count,
            "inlier_ratio": inlier_ratio,
            "reprojection_rmse": 0.0,
            "max_reprojection_error": 0.0,
            "homography": H.tolist(),
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics
    
    # 7. Calculate Reprojection Error
    rmse, max_err, _ = calculate_reprojection_error(src_pts, dst_pts, H, inlier_mask)
    
    # 8. Perspective Warping
    warped_target = warp_image(tgt_img, H, (ref_w, ref_h))
    
    # 9. Visualizations
    matches_vis = create_match_visualization(ref_img, tgt_img, kp_ref, kp_tgt, good_matches, inlier_mask)
    overlay_vis = create_overlay(ref_img, warped_target, alpha=0.5)
    diff_vis = create_difference_image(ref_img, warped_target)
    
    # 10. Save Output Images
    matches_path = os.path.join(output_dir, "matches.jpg")
    registered_path = os.path.join(output_dir, "registered.jpg")
    overlay_path = os.path.join(output_dir, "overlay.jpg")
    diff_path = os.path.join(output_dir, "difference.jpg")
    metrics_path = os.path.join(output_dir, "metrics.json")
    
    cv2.imwrite(matches_path, matches_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(registered_path, warped_target, [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(overlay_path, overlay_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(diff_path, diff_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
    
    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    metrics = {
        "reference_width": ref_w,
        "reference_height": ref_h,
        "target_width": tgt_w,
        "target_height": tgt_h,
        "reference_keypoints": ref_kp_count,
        "target_keypoints": tgt_kp_count,
        "initial_matches": initial_matches_count,
        "good_matches": good_matches_count,
        "inlier_matches": inliers_count,
        "inlier_ratio": inlier_ratio,
        "reprojection_rmse": round(rmse, 4),
        "max_reprojection_error": round(max_err, 4),
        "homography": H.tolist(),
        "processing_time_ms": elapsed_ms,
    }
    
    save_metrics(metrics, metrics_path)
    return True, metrics


def main() -> None:
    parser = argparse.ArgumentParser(
        description="LunaReg Standalone Computer-Vision Registration Engine (SIH26166)"
    )
    parser.add_argument(
        "--reference",
        type=str,
        default="test_images/reference.png",
        help="Path to reference (fixed) lunar image",
    )
    parser.add_argument(
        "--target",
        type=str,
        default="test_images/target.png",
        help="Path to target (unregistered) lunar image",
    )
    parser.add_argument(
        "--ratio",
        type=float,
        default=0.75,
        help="Lowe's distance ratio threshold (default: 0.75)",
    )
    parser.add_argument(
        "--ransac-threshold",
        type=float,
        default=3.0,
        help="RANSAC inlier threshold in pixels (default: 3.0)",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=2000,
        help="Maximum SIFT keypoints to detect per image (default: 2000)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="output",
        help="Directory to save output images and metrics (default: output)",
    )
    
    args = parser.parse_args()
    
    try:
        success, metrics = run_pipeline(
            reference_path=args.reference,
            target_path=args.target,
            ratio_threshold=args.ratio,
            ransac_threshold=args.ransac_threshold,
            max_features=args.max_features,
            output_dir=args.output_dir,
        )
    except Exception as e:
        print(f"Registration Error: {e}", file=sys.stderr)
        sys.exit(1)
        
    print("\n## LunaReg Registration\n")
    print(f"Reference keypoints: {metrics.get('reference_keypoints', 0)}")
    print(f"Target keypoints: {metrics.get('target_keypoints', 0)}")
    print(f"Initial matches: {metrics.get('initial_matches', 0)}")
    print(f"Good matches: {metrics.get('good_matches', 0)}")
    print(f"RANSAC inliers: {metrics.get('inlier_matches', 0)}")
    print(f"Inlier ratio: {metrics.get('inlier_ratio', 0.0)}%")
    print(f"Reprojection RMSE: {metrics.get('reprojection_rmse', 0.0)} px")
    print(f"Processing time: {metrics.get('processing_time_ms', 0.0)} ms\n")
    
    H = metrics.get("homography")
    if H is not None:
        print("Homography Matrix:")
        h_arr = np.array(H)
        for row in h_arr:
            print("  [" + ", ".join(f"{val:12.6f}" for val in row) + "]")
    else:
        print("Homography Matrix: None (Registration Failed)")
        
    if not success:
        print(f"\nStatus: FAILED - {metrics.get('error_message', 'Unknown error')}")
        sys.exit(1)
    else:
        print(f"\nStatus: SUCCESS - Output artifacts saved to '{args.output_dir}/'")


if __name__ == "__main__":
    main()
