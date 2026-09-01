"""
LunaReg Computer-Vision Registration Engine and Evaluation Framework (SIH26166)
============================================================================
Enhanced robust geometric image registration pipeline for lunar surface optical imagery.
"""

import argparse
import csv
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


DETECTOR_MODE_GRID = 'grid'
DETECTOR_MODE_GLOBAL = 'global'


def load_image(image_path: str) -> np.ndarray:
    """Load and validate an image from the filesystem."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError(f"Failed to decode image raster: {image_path}")
    return image


def create_valid_mask(
    image_gray: np.ndarray, black_threshold: int = 5, border_erosion: int = 5
) -> np.ndarray:
    """Detect valid image data and mask out artificial black/no-data borders."""
    mask = (image_gray > black_threshold).astype(np.uint8) * 255
    if border_erosion > 0 and np.any(mask == 0):
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (border_erosion, border_erosion)
        )
        mask = cv2.erode(mask, kernel)
    return mask


def preprocess_image(
    image: np.ndarray,
    use_clahe: bool = True,
    clip_limit: float = 3.0,
    tile_grid_size: Tuple[int, int] = (8, 8),
    normalize: bool = True,
    mask_black_borders: bool = True,
    black_threshold: int = 5,
) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """Convert to grayscale, apply CLAHE normalization, and compute valid region mask."""
    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    mask = None
    if mask_black_borders:
        mask = create_valid_mask(gray, black_threshold=black_threshold)

    if normalize:
        if mask is not None and np.any(mask > 0):
            valid_pixels = gray[mask > 0]
            if len(valid_pixels) > 0:
                p_low, p_high = np.percentile(valid_pixels, (1, 99))
                if p_high > p_low:
                    gray_norm = np.clip(
                        (gray.astype(np.float32) - p_low) * 255.0 / (p_high - p_low),
                        0,
                        255,
                    ).astype(np.uint8)
                else:
                    gray_norm = gray
            else:
                gray_norm = gray
        else:
            gray_norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    else:
        gray_norm = gray

    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
        enhanced = clahe.apply(gray_norm)
    else:
        enhanced = gray_norm

    return gray, enhanced, mask


def detect_features(
    image: np.ndarray,
    mask: Optional[np.ndarray] = None,
    max_features: int = 2000,
    contrast_threshold: float = 0.04,
    edge_threshold: float = 10.0,
) -> Tuple[List[cv2.KeyPoint], Optional[np.ndarray]]:
    """
    Extract SIFT keypoints and descriptors within valid data regions.
    """
    sift = cv2.SIFT_create(
        nfeatures=max_features,
        contrastThreshold=contrast_threshold,
        edgeThreshold=edge_threshold,
    )
    keypoints, descriptors = sift.detectAndCompute(image, mask=mask)
    if keypoints is None:
        keypoints = []
    return keypoints, descriptors


def match_features(
    descriptors_ref: Optional[np.ndarray],
    descriptors_target: Optional[np.ndarray],
    method: str = "flann",
    ratio_threshold: float = 0.75,
    cross_check: bool = True,
) -> Tuple[List[cv2.DMatch], int]:
    """
    Match feature descriptors between reference and target imagery.
    Supports FLANN and BFMatcher, Lowe's distance ratio test, and optional mutual cross-check.
    
    Returns:
        Tuple of (filtered_good_matches, initial_match_count).
    """
    if (
        descriptors_ref is None
        or descriptors_target is None
        or len(descriptors_ref) < 2
        or len(descriptors_target) < 2
    ):
        return [], 0

    if method.lower() == "flann":
        flann_index_kdtree = 1
        index_params = dict(algorithm=flann_index_kdtree, trees=5)
        search_params = dict(checks=50)
        matcher = cv2.FlannBasedMatcher(index_params, search_params)
    else:
        matcher = cv2.BFMatcher(cv2.NORM_L2)

    try:
        matches_12 = matcher.knnMatch(descriptors_ref, descriptors_target, k=2)
    except Exception:
        bf = cv2.BFMatcher(cv2.NORM_L2)
        matches_12 = bf.knnMatch(descriptors_ref, descriptors_target, k=2)

    initial_count = len(matches_12)

    good_12: Dict[int, Tuple[int, float]] = {}
    for match_pair in matches_12:
        if len(match_pair) == 2:
            m, n = match_pair
            if m.distance < ratio_threshold * n.distance:
                good_12[m.queryIdx] = (m.trainIdx, m.distance)

    if cross_check:
        try:
            matches_21 = matcher.knnMatch(descriptors_target, descriptors_ref, k=2)
        except Exception:
            bf = cv2.BFMatcher(cv2.NORM_L2)
            matches_21 = bf.knnMatch(descriptors_target, descriptors_ref, k=2)

        good_21: Dict[int, Tuple[int, float]] = {}
        for match_pair in matches_21:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < ratio_threshold * n.distance:
                    good_21[m.queryIdx] = (m.trainIdx, m.distance)

        mutual_matches: List[cv2.DMatch] = []
        for q_idx, (t_idx, dist) in good_12.items():
            if t_idx in good_21 and good_21[t_idx][0] == q_idx:
                mutual_matches.append(cv2.DMatch(q_idx, t_idx, dist))

        return mutual_matches, initial_count
    else:
        standard_matches: List[cv2.DMatch] = [
            cv2.DMatch(q_idx, t_idx, dist)
            for q_idx, (t_idx, dist) in good_12.items()
        ]
        return standard_matches, initial_count


def estimate_homography(
    keypoints_ref: List[cv2.KeyPoint],
    keypoints_target: List[cv2.KeyPoint],
    matches: List[cv2.DMatch],
    ransac_threshold: float = 3.0,
    max_iters: int = 2000,
    confidence: float = 0.995,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], np.ndarray, np.ndarray]:
    """
    Estimate projective 3x3 Homography H relating target image coordinates to reference image coordinates
    using RANSAC outlier elimination.
    Mapping: x_ref = H * x_target
    """
    if len(matches) < 4:
        return None, None, np.empty((0, 1, 2), dtype=np.float32), np.empty((0, 1, 2), dtype=np.float32)

    # Query is Reference (dst), Train is Target (src)
    dst_pts = np.float32([keypoints_ref[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    src_pts = np.float32([keypoints_target[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(
        src_pts, dst_pts, cv2.RANSAC, ransac_threshold, maxIters=max_iters, confidence=confidence
    )

    inlier_mask = mask.ravel() if mask is not None else None
    return H, inlier_mask, src_pts, dst_pts


def calculate_reprojection_error(
    src_pts: np.ndarray,
    dst_pts: np.ndarray,
    H: Optional[np.ndarray],
    inlier_mask: Optional[np.ndarray],
) -> Tuple[float, float, float, List[float]]:
    """
    Calculate Root Mean Square Error (RMSE), median error, and maximum reprojection error
    for the verified inlier set.
    """
    if (
        H is None
        or inlier_mask is None
        or len(src_pts) == 0
        or np.sum(inlier_mask) == 0
    ):
        return 0.0, 0.0, 0.0, []

    mask_bool = inlier_mask.astype(bool)
    inlier_src = src_pts[mask_bool]
    inlier_dst = dst_pts[mask_bool]

    # Project target points to reference frame
    projected_pts = cv2.perspectiveTransform(inlier_src, H)

    # Euclidean error per point ||x_dst - x_proj||_2
    errors = np.linalg.norm(inlier_dst - projected_pts, axis=2).ravel()

    rmse = float(np.sqrt(np.mean(errors ** 2)))
    median_error = float(np.median(errors))
    max_error = float(np.max(errors))
    return rmse, median_error, max_error, errors.tolist()


def analyze_spatial_distribution(
    inlier_pts_ref: np.ndarray,
    width: int,
    height: int,
    grid_rows: int = 8,
    grid_cols: int = 4,
) -> Dict[str, Any]:
    """
    Analyze the spatial dispersion and distribution uniformity of inlier correspondences
    across the reference image coordinate space.
    """
    if len(inlier_pts_ref) == 0:
        return {
            "bbox": {"min_x": 0.0, "min_y": 0.0, "max_x": 0.0, "max_y": 0.0, "width": 0.0, "height": 0.0},
            "bbox_coverage_pct": 0.0,
            "hull_coverage_pct": 0.0,
            "grid_rows": grid_rows,
            "grid_cols": grid_cols,
            "total_grid_cells": grid_rows * grid_cols,
            "occupied_grid_cells": 0,
            "grid_occupancy_ratio": 0.0,
            "assessment": "no_inliers",
            "grid_counts": [[0] * grid_cols for _ in range(grid_rows)],
        }

    xs = inlier_pts_ref[:, 0]
    ys = inlier_pts_ref[:, 1]

    min_x, max_x = float(np.min(xs)), float(np.max(xs))
    min_y, max_y = float(np.min(ys)), float(np.max(ys))
    bbox_w = max_x - min_x
    bbox_h = max_y - min_y

    total_area = float(width * height)
    bbox_area = bbox_w * bbox_h
    bbox_coverage_pct = round((bbox_area / total_area) * 100.0, 2)

    if len(inlier_pts_ref) >= 3:
        hull = cv2.convexHull(inlier_pts_ref.astype(np.float32))
        hull_area = float(cv2.contourArea(hull))
        hull_coverage_pct = round((hull_area / total_area) * 100.0, 2)
    else:
        hull_coverage_pct = bbox_coverage_pct

    cell_w = width / float(grid_cols)
    cell_h = height / float(grid_rows)

    grid = np.zeros((grid_rows, grid_cols), dtype=int)
    for x, y in inlier_pts_ref:
        r = min(grid_rows - 1, max(0, int(y // cell_h)))
        c = min(grid_cols - 1, max(0, int(x // cell_w)))
        grid[r, c] += 1

    occupied = int(np.count_nonzero(grid))
    total_cells = grid_rows * grid_cols
    grid_occupancy_ratio = round((occupied / total_cells) * 100.0, 2)

    v_span = bbox_h / float(height)
    h_span = bbox_w / float(width)

    # Determine spatial classification
    if v_span < 0.40:
        if min_y < height * 0.30:
            assessment = "concentrated_in_top_region"
        elif max_y > height * 0.70:
            assessment = "concentrated_in_bottom_region"
        else:
            assessment = "concentrated_in_middle_band"
    elif grid_occupancy_ratio >= 60.0 and v_span > 0.75 and h_span > 0.75:
        assessment = "widely_distributed"
    elif grid_occupancy_ratio >= 35.0 and v_span > 0.50:
        assessment = "moderately_distributed"
    elif h_span < 0.40:
        assessment = "concentrated_in_narrow_column"
    else:
        assessment = "concentrated_in_subregions"

    return {
        "bbox": {
            "min_x": round(min_x, 1),
            "min_y": round(min_y, 1),
            "max_x": round(max_x, 1),
            "max_y": round(max_y, 1),
            "width": round(bbox_w, 1),
            "height": round(bbox_h, 1),
        },
        "bbox_coverage_pct": bbox_coverage_pct,
        "hull_coverage_pct": hull_coverage_pct,
        "grid_rows": grid_rows,
        "grid_cols": grid_cols,
        "total_grid_cells": total_cells,
        "occupied_grid_cells": occupied,
        "grid_occupancy_ratio": grid_occupancy_ratio,
        "assessment": assessment,
        "grid_counts": grid.tolist(),
    }


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
    spatial_info: Optional[Dict[str, Any]] = None,
    rmse: float = 0.0,
) -> np.ndarray:
    """
    Generate a high-clarity side-by-side match correspondence visualization
    distinguishing verified inliers (solid green) from rejected outliers (dashed/subtle red).
    """
    h1, w1 = ref_image.shape[:2]
    h2, w2 = target_image.shape[:2]

    out_h = max(h1, h2)
    out_w = w1 + w2

    scale_factor = max(1.0, out_h / 1200.0)
    line_thickness_inlier = max(1, int(round(1.5 * scale_factor)))
    line_thickness_outlier = max(1, int(round(1.0 * scale_factor)))
    pt_radius = max(2, int(round(2.5 * scale_factor)))

    composite = np.zeros((out_h, out_w, 3), dtype=np.uint8)
    composite[:h1, :w1] = ref_image if len(ref_image.shape) == 3 else cv2.cvtColor(ref_image, cv2.COLOR_GRAY2BGR)
    composite[:h2, w1:w1 + w2] = target_image if len(target_image.shape) == 3 else cv2.cvtColor(target_image, cv2.COLOR_GRAY2BGR)

    # Center vertical boundary
    cv2.line(composite, (w1, 0), (w1, out_h), (90, 90, 90), max(1, int(round(2 * scale_factor))))

    inliers_count = 0
    outliers_count = 0

    # Draw outlier matches first (red, subtle)
    for i, m in enumerate(matches):
        is_inlier = bool(inlier_mask[i]) if (inlier_mask is not None and i < len(inlier_mask)) else False
        if not is_inlier:
            outliers_count += 1
            pt1 = (int(round(keypoints_ref[m.queryIdx].pt[0])), int(round(keypoints_ref[m.queryIdx].pt[1])))
            pt2 = (int(round(keypoints_target[m.trainIdx].pt[0])) + w1, int(round(keypoints_target[m.trainIdx].pt[1])))
            cv2.line(composite, pt1, pt2, (0, 0, 180), line_thickness_outlier, lineType=cv2.LINE_AA)

    # Draw inlier matches on top (bright green)
    for i, m in enumerate(matches):
        is_inlier = bool(inlier_mask[i]) if (inlier_mask is not None and i < len(inlier_mask)) else False
        if is_inlier:
            inliers_count += 1
            pt1 = (int(round(keypoints_ref[m.queryIdx].pt[0])), int(round(keypoints_ref[m.queryIdx].pt[1])))
            pt2 = (int(round(keypoints_target[m.trainIdx].pt[0])) + w1, int(round(keypoints_target[m.trainIdx].pt[1])))
            cv2.line(composite, pt1, pt2, (0, 230, 40), line_thickness_inlier, lineType=cv2.LINE_AA)

    # Draw keypoint circles on inliers
    for i, m in enumerate(matches):
        is_inlier = bool(inlier_mask[i]) if (inlier_mask is not None and i < len(inlier_mask)) else False
        if is_inlier:
            pt1 = (int(round(keypoints_ref[m.queryIdx].pt[0])), int(round(keypoints_ref[m.queryIdx].pt[1])))
            pt2 = (int(round(keypoints_target[m.trainIdx].pt[0])) + w1, int(round(keypoints_target[m.trainIdx].pt[1])))
            cv2.circle(composite, pt1, pt_radius, (255, 200, 0), -1, lineType=cv2.LINE_AA)
            cv2.circle(composite, pt2, pt_radius, (0, 180, 255), -1, lineType=cv2.LINE_AA)

    # Top Annotation Banner
    banner_height = max(50, int(round(50 * (out_w / 2400.0))))
    banner = np.zeros((banner_height, out_w, 3), dtype=np.uint8)
    banner[:] = (18, 18, 22)

    font_scale = max(0.5, 0.65 * (out_w / 2400.0))
    text_thickness = max(1, int(round(1.5 * (out_w / 2400.0))))

    inlier_ratio_str = f"{(inliers_count / len(matches) * 100.0):.1f}%" if len(matches) > 0 else "0.0%"
    spatial_str = f"Occupancy: {spatial_info['grid_occupancy_ratio']}% ({spatial_info['occupied_grid_cells']}/{spatial_info['total_grid_cells']} cells)" if spatial_info else ""

    cv2.putText(
        banner,
        f"REFERENCE ({w1}x{h1})",
        (int(16 * scale_factor), int(banner_height * 0.65)),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale,
        (255, 200, 0),
        text_thickness,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"TARGET ({w2}x{h2})",
        (w1 + int(16 * scale_factor), int(banner_height * 0.65)),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale,
        (0, 180, 255),
        text_thickness,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"Inliers: {inliers_count} (Green) | Outliers: {outliers_count} (Red) | Inlier Ratio: {inlier_ratio_str} | RMSE: {rmse:.2f}px | {spatial_str}",
        (w1 - int(450 * font_scale), int(banner_height * 0.65)),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale * 0.85,
        (220, 220, 220),
        max(1, text_thickness - 1),
        cv2.LINE_AA,
    )

    return np.vstack([banner, composite])


def create_overlay(
    ref_image: np.ndarray, warped_target: np.ndarray, alpha: float = 0.5
) -> np.ndarray:
    """
    Generate an alpha-blended overlay image of the reference and registered target.
    """
    ref_bgr = ref_image if len(ref_image.shape) == 3 else cv2.cvtColor(ref_image, cv2.COLOR_GRAY2BGR)
    warped_bgr = warped_target if len(warped_target.shape) == 3 else cv2.cvtColor(warped_target, cv2.COLOR_GRAY2BGR)
    return cv2.addWeighted(ref_bgr, 1.0 - alpha, warped_bgr, alpha, 0)


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

    # Mask out non-overlapping background (where warped target is unmapped)
    valid_mask = warped_gray > 0
    heatmap[~valid_mask] = (15, 15, 20)

    return heatmap


def save_metrics(metrics: Dict[str, Any], output_path: str) -> None:
    """
    Save registration metrics to a formatted JSON file.
    """
    clean_metrics = {k: v for k, v in metrics.items() if not isinstance(v, np.ndarray)}
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(clean_metrics, f, indent=2)



def run_pipeline(
    reference_path: str,
    target_path: str,
    ratio_threshold: float = 0.75,
    ransac_threshold: float = 3.0,
    max_features: int = 2000,
    matcher_method: str = "flann",
    cross_check: bool = True,
    use_clahe: bool = True,
    clahe_clip_limit: float = 3.0,
    clahe_grid_size: Tuple[int, int] = (8, 8),
    output_dir: str = "output",
    save_visualizations: bool = True,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Execute the end-to-end computer-vision registration workflow.
    """
    start_time = time.perf_counter()
    os.makedirs(output_dir, exist_ok=True)

    params_dict = {
        "max_features": max_features,
        "ratio_threshold": ratio_threshold,
        "ransac_threshold": ransac_threshold,
        "matcher_method": matcher_method,
        "cross_check": cross_check,
        "use_clahe": use_clahe,
        "clahe_clip_limit": clahe_clip_limit,
        "clahe_grid_size": list(clahe_grid_size),
    }

    # 1. Load Images
    ref_img = load_image(reference_path)
    tgt_img = load_image(target_path)

    ref_h, ref_w = ref_img.shape[:2]
    tgt_h, tgt_w = tgt_img.shape[:2]

    # 2. Preprocessing & Masking
    ref_gray, ref_enhanced, ref_mask = preprocess_image(
        ref_img,
        use_clahe=use_clahe,
        clip_limit=clahe_clip_limit,
        tile_grid_size=clahe_grid_size,
    )
    tgt_gray, tgt_enhanced, tgt_mask = preprocess_image(
        tgt_img,
        use_clahe=use_clahe,
        clip_limit=clahe_clip_limit,
        tile_grid_size=clahe_grid_size,
    )

    # 3. Detect SIFT Features & Compute Descriptors
    kp_ref, des_ref = detect_features(ref_enhanced, mask=ref_mask, max_features=max_features)
    kp_tgt, des_tgt = detect_features(tgt_enhanced, mask=tgt_mask, max_features=max_features)

    ref_kp_count = len(kp_ref)
    tgt_kp_count = len(kp_tgt)

    if ref_kp_count == 0 or tgt_kp_count == 0 or des_ref is None or des_tgt is None:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics: Dict[str, Any] = {
            "status": "failed",
            "error_message": "Insufficient feature keypoints detected in one or both images.",
            "parameters": params_dict,
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
            "median_reprojection_error": 0.0,
            "max_reprojection_error": 0.0,
            "spatial_distribution": analyze_spatial_distribution(np.empty((0, 2)), ref_w, ref_h),
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics

    # 4. Feature Matching
    good_matches, initial_matches_count = match_features(
        des_ref,
        des_tgt,
        method=matcher_method,
        ratio_threshold=ratio_threshold,
        cross_check=cross_check,
    )
    good_matches_count = len(good_matches)

    if good_matches_count < 4:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": f"Insufficient geometric correspondences after ratio test ({good_matches_count} < 4).",
            "parameters": params_dict,
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
            "median_reprojection_error": 0.0,
            "max_reprojection_error": 0.0,
            "spatial_distribution": analyze_spatial_distribution(np.empty((0, 2)), ref_w, ref_h),
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics

    # 5. RANSAC Homography Estimation
    H, inlier_mask, src_pts, dst_pts = estimate_homography(
        kp_ref, kp_tgt, good_matches, ransac_threshold=ransac_threshold
    )

    if H is None or inlier_mask is None:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": "RANSAC failed to compute a stable homography matrix.",
            "parameters": params_dict,
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
            "median_reprojection_error": 0.0,
            "max_reprojection_error": 0.0,
            "spatial_distribution": analyze_spatial_distribution(np.empty((0, 2)), ref_w, ref_h),
            "homography": None,
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics

    inliers_count = int(np.sum(inlier_mask))
    inlier_ratio = round((inliers_count / good_matches_count) * 100.0, 2) if good_matches_count > 0 else 0.0

    # 6. Extract Inlier Points & Perform Spatial Analysis
    inlier_bool = inlier_mask.astype(bool)
    inlier_pts_ref = dst_pts[inlier_bool].reshape(-1, 2)
    spatial_analysis = analyze_spatial_distribution(inlier_pts_ref, ref_w, ref_h, grid_rows=8, grid_cols=4)

    if inliers_count < 4:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        metrics = {
            "status": "failed",
            "error_message": f"Too few inliers retained after RANSAC ({inliers_count} < 4).",
            "parameters": params_dict,
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
            "median_reprojection_error": 0.0,
            "max_reprojection_error": 0.0,
            "spatial_distribution": spatial_analysis,
            "homography": H.tolist(),
            "processing_time_ms": elapsed_ms,
        }
        save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
        return False, metrics

    # 7. Calculate Reprojection Error
    rmse, median_err, max_err, _ = calculate_reprojection_error(src_pts, dst_pts, H, inlier_mask)

    # 8. Perspective Warping
    warped_target = warp_image(tgt_img, H, (ref_w, ref_h))

    # 9. Visualizations
    if save_visualizations:
        matches_vis = create_match_visualization(
            ref_img, tgt_img, kp_ref, kp_tgt, good_matches, inlier_mask, spatial_info=spatial_analysis, rmse=rmse
        )
        overlay_vis = create_overlay(ref_img, warped_target, alpha=0.5)
        diff_vis = create_difference_image(ref_img, warped_target)

        cv2.imwrite(os.path.join(output_dir, "matches.jpg"), matches_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(output_dir, "registered.jpg"), warped_target, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(output_dir, "overlay.jpg"), overlay_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(output_dir, "difference.jpg"), diff_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    metrics = {
        "status": "success",
        "parameters": params_dict,
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
        "median_reprojection_error": round(median_err, 4),
        "max_reprojection_error": round(max_err, 4),
        "spatial_distribution": spatial_analysis,
        "homography": H.tolist(),
        "processing_time_ms": elapsed_ms,
    }

    save_metrics(metrics, os.path.join(output_dir, "metrics.json"))
    return True, metrics


def run_benchmark_experiments(
    reference_path: str,
    target_path: str,
    experiments_dir: str = "backend/experiments",
) -> List[Dict[str, Any]]:
    """
    Execute systematic parameter sweep experiments across feature budgets, matchers,
    cross-check mutual consistency, ratio thresholds, and RANSAC tolerances.
    Generates subfolders and an aggregated summary CSV.
    """
    os.makedirs(experiments_dir, exist_ok=True)
    print(f"\n=======================================================")
    print(f"   LunaReg SIH26166 Parameter Benchmark Suite")
    print(f"=======================================================\n")
    print(f"Reference: {reference_path}")
    print(f"Target:    {target_path}")
    print(f"Output:    {experiments_dir}/\n")

    # Define experimental parameter grid
    parameter_grid: List[Dict[str, Any]] = [
        # Baseline Comparison: FLANN vs BFMatcher vs CrossCheck
        {"id": "exp_01_baseline_flann", "max_features": 2000, "matcher": "flann", "cross_check": False, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 3.0},
        {"id": "exp_02_baseline_bf", "max_features": 2000, "matcher": "bf", "cross_check": False, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 3.0},
        {"id": "exp_03_mutual_consistency", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 3.0},

        # Feature Budget Sweep: 1000, 2000, 4000
        {"id": "exp_04_features_1000", "max_features": 1000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 3.0},
        {"id": "exp_05_features_4000", "max_features": 4000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 3.0},

        # Lowe Ratio Threshold Sweep: 0.65, 0.70, 0.75, 0.80
        {"id": "exp_06_ratio_065", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.65, "ransac": 3.0, "clahe_clip": 3.0},
        {"id": "exp_07_ratio_070", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.70, "ransac": 3.0, "clahe_clip": 3.0},
        {"id": "exp_08_ratio_080", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.80, "ransac": 3.0, "clahe_clip": 3.0},

        # RANSAC Epipolar Threshold Sweep: 1.5, 2.0, 3.0, 5.0 px
        {"id": "exp_09_ransac_15px", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 1.5, "clahe_clip": 3.0},
        {"id": "exp_10_ransac_20px", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 2.0, "clahe_clip": 3.0},
        {"id": "exp_11_ransac_50px", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 5.0, "clahe_clip": 3.0},

        # CLAHE Contrast Tuning
        {"id": "exp_12_clahe_clip20", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 2.0},
        {"id": "exp_13_clahe_clip40", "max_features": 2000, "matcher": "flann", "cross_check": True, "ratio": 0.75, "ransac": 3.0, "clahe_clip": 4.0},

        # High-Precision Optimal Candidate
        {"id": "exp_14_optimal_candidate", "max_features": 4000, "matcher": "flann", "cross_check": True, "ratio": 0.70, "ransac": 2.5, "clahe_clip": 3.0},
    ]

    results_summary: List[Dict[str, Any]] = []

    for i, p in enumerate(parameter_grid, 1):
        exp_id = p["id"]
        exp_out_dir = os.path.join(experiments_dir, exp_id)
        print(f"[{i:02d}/{len(parameter_grid):02d}] Running {exp_id} ...", end=" ", flush=True)

        success, metrics = run_pipeline(
            reference_path=reference_path,
            target_path=target_path,
            max_features=p["max_features"],
            matcher_method=p["matcher"],
            cross_check=p["cross_check"],
            ratio_threshold=p["ratio"],
            ransac_threshold=p["ransac"],
            use_clahe=True,
            clahe_clip_limit=p["clahe_clip"],
            output_dir=exp_out_dir,
            save_visualizations=True,
        )

        spatial = metrics.get("spatial_distribution", {})
        row = {
            "experiment_id": exp_id,
            "status": "SUCCESS" if success else "FAILED",
            "max_features": p["max_features"],
            "matcher": p["matcher"],
            "cross_check": p["cross_check"],
            "ratio": p["ratio"],
            "ransac_threshold_px": p["ransac"],
            "clahe_clip": p["clahe_clip"],
            "initial_matches": metrics.get("initial_matches", 0),
            "good_matches": metrics.get("good_matches", 0),
            "inlier_matches": metrics.get("inlier_matches", 0),
            "inlier_ratio_pct": metrics.get("inlier_ratio", 0.0),
            "reprojection_rmse_px": metrics.get("reprojection_rmse", 0.0),
            "median_error_px": metrics.get("median_reprojection_error", 0.0),
            "max_error_px": metrics.get("max_reprojection_error", 0.0),
            "occupied_cells": spatial.get("occupied_grid_cells", 0),
            "total_cells": spatial.get("total_grid_cells", 32),
            "grid_occupancy_pct": spatial.get("grid_occupancy_ratio", 0.0),
            "bbox_coverage_pct": spatial.get("bbox_coverage_pct", 0.0),
            "spatial_assessment": spatial.get("assessment", "unknown"),
            "processing_time_ms": metrics.get("processing_time_ms", 0.0),
        }
        results_summary.append(row)
        print(f"Done ({row['inlier_matches']} inliers, {row['inlier_ratio_pct']}%, RMSE: {row['reprojection_rmse_px']}px, {row['processing_time_ms']}ms)")

    csv_path = os.path.join(experiments_dir, "experiments_summary.csv")
    if len(results_summary) > 0:
        fieldnames = list(results_summary[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results_summary)
        print(f"\nSaved benchmark summary table to: {csv_path}")

    return results_summary


def create_tile_overview(
    ref_image: np.ndarray,
    target_image: np.ndarray,
    roi_results: List[Dict[str, Any]],
    output_path: str,
) -> None:
    """
    Generate an overview visualization of the entire lunar strip showing:
    - Reference strip with colored bounding boxes (green for SUCCESS, red for FAILED) and metric tags
    - Target strip with corresponding search windows
    - Full-strip registered mosaic / alignment proof
    - Header banner summarizing overall tile registration statistics.
    """
    h_ref, w_ref = ref_image.shape[:2]
    h_tgt, w_tgt = target_image.shape[:2]
    max_h = max(h_ref, h_tgt)

    ref_bgr = ref_image if len(ref_image.shape) == 3 else cv2.cvtColor(ref_image, cv2.COLOR_GRAY2BGR)
    tgt_bgr = target_image if len(target_image.shape) == 3 else cv2.cvtColor(target_image, cv2.COLOR_GRAY2BGR)

    panel_ref = np.zeros((max_h, w_ref, 3), dtype=np.uint8)
    panel_tgt = np.zeros((max_h, w_tgt, 3), dtype=np.uint8)
    panel_mosaic = np.zeros((max_h, w_ref, 3), dtype=np.uint8)

    panel_ref[:h_ref, :w_ref] = ref_bgr
    panel_tgt[:h_tgt, :w_tgt] = tgt_bgr

    total_inliers = 0
    successful_rois = 0
    failed_rois = 0
    rmses: List[float] = []

    # Draw ROI annotations on reference and target panels
    for r in roi_results:
        status = r.get("status", "FAILED")
        ref_y1, ref_y2 = r["ref_y1"], r["ref_y2"]
        tgt_y1, tgt_y2 = r["tgt_y1"], r["tgt_y2"]
        inliers = r.get("inlier_matches", 0)
        ratio = r.get("inlier_ratio_pct", 0.0)
        rmse = r.get("reprojection_rmse_px", 0.0)
        roi_idx = r.get("roi_index", 1)

        is_success = (status == "SUCCESS")
        if is_success:
            successful_rois += 1
            total_inliers += inliers
            rmses.append(rmse)
            box_color = (0, 230, 40)      # Green
            bg_color = (0, 60, 10)
        else:
            failed_rois += 1
            box_color = (0, 0, 230)       # Red
            bg_color = (60, 0, 10)

        # Draw ROI box on Reference Panel
        cv2.rectangle(panel_ref, (4, ref_y1), (w_ref - 4, ref_y2), box_color, 4)
        
        # Semi-transparent tag background
        tag_h = min(120, (ref_y2 - ref_y1) // 3)
        tag_w = w_ref - 20
        tag_overlay = panel_ref[ref_y1 + 10:ref_y1 + 10 + tag_h, 10:10 + tag_w].copy()
        tag_bg = np.full_like(tag_overlay, bg_color)
        cv2.addWeighted(tag_overlay, 0.3, tag_bg, 0.7, 0, tag_overlay)
        panel_ref[ref_y1 + 10:ref_y1 + 10 + tag_h, 10:10 + tag_w] = tag_overlay
        cv2.rectangle(panel_ref, (10, ref_y1 + 10), (10 + tag_w, ref_y1 + 10 + tag_h), box_color, 2)

        # Tag Text
        cv2.putText(
            panel_ref,
            f"ROI {roi_idx:02d}: {status}",
            (25, ref_y1 + 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            box_color,
            2,
            cv2.LINE_AA,
        )
        if is_success:
            detail_str = f"Inliers: {inliers} ({ratio:.1f}%) | RMSE: {rmse:.2f}px | Y: {ref_y1}..{ref_y2}"
        else:
            detail_str = f"FAILED: {r.get('reason', 'insufficient overlap')} | Y: {ref_y1}..{ref_y2}"

        cv2.putText(
            panel_ref,
            detail_str,
            (25, ref_y1 + 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (230, 230, 230),
            2,
            cv2.LINE_AA,
        )

        # Draw search window on Target Panel
        cv2.rectangle(panel_tgt, (4, tgt_y1), (w_tgt - 4, tgt_y2), (255, 180, 0), 3)
        cv2.putText(
            panel_tgt,
            f"Tgt Search {roi_idx:02d} (Y:{tgt_y1}..{tgt_y2})",
            (20, min(h_tgt - 20, tgt_y1 + 35)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (255, 200, 0),
            2,
            cv2.LINE_AA,
        )

        # Accumulate Warped Mosaic for Successful ROIs
        warped_roi = r.get("warped_image")
        if is_success and warped_roi is not None:
            roi_h = ref_y2 - ref_y1
            panel_mosaic[ref_y1:ref_y2, :] = cv2.addWeighted(
                panel_ref[ref_y1:ref_y2, :], 0.5, warped_roi[:roi_h, :w_ref], 0.5, 0
            )

    # Fill unmapped mosaic areas with dim reference
    unmapped = (panel_mosaic[:h_ref, :w_ref, 0] == 0) & (panel_mosaic[:h_ref, :w_ref, 1] == 0) & (panel_mosaic[:h_ref, :w_ref, 2] == 0)
    panel_mosaic[:h_ref, :w_ref][unmapped] = (panel_ref[:h_ref, :w_ref][unmapped].astype(np.float32) * 0.35).astype(np.uint8)

    # Combine 3 panels side by side with gutters
    gutter_w = 20
    gutter = np.full((max_h, gutter_w, 3), 30, dtype=np.uint8)
    combined_body = np.hstack([panel_ref, gutter, panel_tgt, gutter, panel_mosaic])

    # Build Header Banner
    banner_h = 130
    banner_w = combined_body.shape[1]
    banner = np.zeros((banner_h, banner_w, 3), dtype=np.uint8)
    banner[:] = (18, 18, 24)

    mean_rmse_str = f"{np.mean(rmses):.2f} px" if len(rmses) > 0 else "N/A"
    
    cv2.putText(
        banner,
        "LUNAREG ROI / TILE REGISTRATION OVERVIEW (SIH26166)",
        (30, 45),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (0, 210, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"Total ROIs: {len(roi_results)}  |  Successful: {successful_rois} (Green)  |  Failed: {failed_rois} (Red)  |  Total Inliers: {total_inliers}  |  Mean Inlier RMSE: {mean_rmse_str}",
        (30, 85),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (220, 220, 220),
        2,
        cv2.LINE_AA,
    )

    # Column Subheaders
    cv2.putText(
        banner,
        f"PANEL 1: REFERENCE ({w_ref}x{h_ref})",
        (30, 115),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 200, 0),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"PANEL 2: TARGET SEARCH ({w_tgt}x{h_tgt})",
        (w_ref + gutter_w + 30, 115),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 180, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"PANEL 3: REGISTERED OVERLAY MOSAIC",
        (2 * (w_ref + gutter_w) + 30, 115),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 240, 100),
        1,
        cv2.LINE_AA,
    )

    overview = np.vstack([banner, combined_body])
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    cv2.imwrite(output_path, overview, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved full-strip tile overview visualization to: {output_path}")


def run_roi_pipeline(
    reference_path: str,
    target_path: str,
    roi_height: int = 2000,
    roi_overlap: int = 500,
    vertical_offset: float = -380.0,
    search_margin: int = 500,
    max_features_per_roi: int = 1500,
    ratio_threshold: float = 0.75,
    ransac_threshold: float = 3.0,
    matcher_method: str = "flann",
    cross_check: bool = True,
    min_inliers: int = 30,
    min_inlier_ratio: float = 25.0,
    max_rmse: float = 3.0,
    min_grid_occupancy: float = 12.5,
    output_dir: str = "backend/experiments/tiles",
    save_visualizations: bool = True,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Execute independent local tile / ROI registration across overlapping vertical sections
    of the lunar image strip.
    """
    os.makedirs(output_dir, exist_ok=True)
    total_start = time.perf_counter()

    ref_img = load_image(reference_path)
    tgt_img = load_image(target_path)

    h_ref, w_ref = ref_img.shape[:2]
    h_tgt, w_tgt = tgt_img.shape[:2]

    # Preprocessing
    _, ref_enh, ref_mask = preprocess_image(ref_img, use_clahe=True, clip_limit=3.0)
    _, tgt_enh, tgt_mask = preprocess_image(tgt_img, use_clahe=True, clip_limit=3.0)

    # Compute overlapping vertical partitions
    step = roi_height - roi_overlap
    y_starts = list(range(0, h_ref - roi_overlap, step))
    if len(y_starts) == 0 or (y_starts[-1] + roi_height < h_ref):
        y_starts.append(max(0, h_ref - roi_height))

    roi_results: List[Dict[str, Any]] = []

    print(f"\n=======================================================")
    print(f"   LunaReg SIH26166 ROI / Tile Registration Mode")
    print(f"=======================================================")
    print(f"Reference:       {reference_path} ({w_ref}x{h_ref})")
    print(f"Target:          {target_path} ({w_tgt}x{h_tgt})")
    print(f"ROI Height:      {roi_height} px | Overlap: {roi_overlap} px")
    print(f"Vertical Offset: {vertical_offset} px | Margin: {search_margin} px")
    print(f"Total ROIs:      {len(y_starts)}\n")

    for i, ref_y1 in enumerate(y_starts, 1):
        roi_start = time.perf_counter()
        ref_y2 = min(h_ref, ref_y1 + roi_height)
        cur_roi_h = ref_y2 - ref_y1

        # Search window in target
        tgt_y1 = max(0, int(round(ref_y1 - vertical_offset - search_margin)))
        tgt_y2 = min(h_tgt, int(round(ref_y2 - vertical_offset + search_margin)))
        cur_tgt_h = tgt_y2 - tgt_y1

        roi_folder = os.path.join(output_dir, f"roi_{i:02d}")
        os.makedirs(roi_folder, exist_ok=True)

        sub_ref = ref_enh[ref_y1:ref_y2, :]
        sub_tgt = tgt_enh[tgt_y1:tgt_y2, :]

        sub_ref_mask = ref_mask[ref_y1:ref_y2, :] if ref_mask is not None else None
        sub_tgt_mask = tgt_mask[tgt_y1:tgt_y2, :] if tgt_mask is not None else None

        sub_ref_bgr = ref_img[ref_y1:ref_y2, :]
        sub_tgt_bgr = tgt_img[tgt_y1:tgt_y2, :]

        kp_ref, des_ref = detect_features(sub_ref, mask=sub_ref_mask, max_features=max_features_per_roi)
        kp_tgt, des_tgt = detect_features(sub_tgt, mask=sub_tgt_mask, max_features=max_features_per_roi)

        ref_kp_count = len(kp_ref)
        tgt_kp_count = len(kp_tgt)

        if ref_kp_count < 4 or tgt_kp_count < 4 or des_ref is None or des_tgt is None:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": "insufficient keypoints detected",
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": 0,
                "good_matches": 0,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "no_inliers",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            save_metrics(row, os.path.join(roi_folder, "metrics.json"))
            print(f"ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - insufficient keypoints ({ref_kp_count}, {tgt_kp_count})")
            continue

        good_matches, init_matches_count = match_features(
            des_ref,
            des_tgt,
            method=matcher_method,
            ratio_threshold=ratio_threshold,
            cross_check=cross_check,
        )
        good_count = len(good_matches)

        if good_count < 4:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": f"insufficient correspondences ({good_count} < 4)",
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": init_matches_count,
                "good_matches": good_count,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "insufficient_matches",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            save_metrics(row, os.path.join(roi_folder, "metrics.json"))
            print(f"ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - insufficient correspondences ({good_count})")
            continue

        H_local, inlier_mask, src_local, dst_local = estimate_homography(
            kp_ref, kp_tgt, good_matches, ransac_threshold=ransac_threshold
        )

        if H_local is None or inlier_mask is None:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": "RANSAC homography estimation failed",
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": init_matches_count,
                "good_matches": good_count,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "ransac_failed",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            save_metrics(row, os.path.join(roi_folder, "metrics.json"))
            print(f"ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - RANSAC failed")
            continue

        inliers_count = int(np.sum(inlier_mask))
        inlier_ratio = round((inliers_count / good_count) * 100.0, 2) if good_count > 0 else 0.0

        rmse, med_err, max_err, _ = calculate_reprojection_error(src_local, dst_local, H_local, inlier_mask)

        inlier_bool = inlier_mask.astype(bool)
        inlier_pts_local = dst_local[inlier_bool].reshape(-1, 2)
        spatial_analysis = analyze_spatial_distribution(inlier_pts_local, w_ref, cur_roi_h, grid_rows=4, grid_cols=4)
        grid_occ = spatial_analysis.get("grid_occupancy_ratio", 0.0)

        # Check Usability Criteria
        if inliers_count < min_inliers:
            status = "FAILED"
            reason = f"insufficient inliers ({inliers_count} < {min_inliers})"
        elif inlier_ratio < min_inlier_ratio:
            status = "FAILED"
            reason = f"low inlier ratio ({inlier_ratio:.1f}% < {min_inlier_ratio:.1f}%)"
        elif rmse > max_rmse:
            status = "FAILED"
            reason = f"high reprojection error ({rmse:.2f}px > {max_rmse:.2f}px)"
        elif grid_occ < min_grid_occupancy:
            status = "FAILED"
            reason = f"concentrated in tiny area ({grid_occ:.1f}%)"
        else:
            status = "SUCCESS"
            reason = "passed all usability criteria"

        # Local Warping & Visualizations
        warped_sub_tgt = warp_image(sub_tgt_bgr, H_local, (w_ref, cur_roi_h))

        if save_visualizations:
            matches_vis = create_match_visualization(
                sub_ref_bgr, sub_tgt_bgr, kp_ref, kp_tgt, good_matches, inlier_mask, spatial_info=spatial_analysis, rmse=rmse
            )
            overlay_vis = create_overlay(sub_ref_bgr, warped_sub_tgt, alpha=0.5)
            diff_vis = create_difference_image(sub_ref_bgr, warped_sub_tgt)

            cv2.imwrite(os.path.join(roi_folder, "matches.jpg"), matches_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cv2.imwrite(os.path.join(roi_folder, "registered.jpg"), warped_sub_tgt, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cv2.imwrite(os.path.join(roi_folder, "overlay.jpg"), overlay_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cv2.imwrite(os.path.join(roi_folder, "difference.jpg"), diff_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])

        roi_time = round((time.perf_counter() - roi_start) * 1000, 2)

        row = {
            "roi_index": i,
            "status": status,
            "reason": reason,
            "ref_y1": ref_y1,
            "ref_y2": ref_y2,
            "tgt_y1": tgt_y1,
            "tgt_y2": tgt_y2,
            "ref_kp": ref_kp_count,
            "tgt_kp": tgt_kp_count,
            "initial_matches": init_matches_count,
            "good_matches": good_count,
            "inlier_matches": inliers_count,
            "inlier_ratio_pct": inlier_ratio,
            "reprojection_rmse_px": round(rmse, 4),
            "median_error_px": round(med_err, 4),
            "max_error_px": round(max_err, 4),
            "grid_occupancy_pct": grid_occ,
            "bbox_coverage_pct": spatial_analysis.get("bbox_coverage_pct", 0.0),
            "spatial_assessment": spatial_analysis.get("assessment", "unknown"),
            "homography": H_local.tolist() if H_local is not None else None,
            "processing_time_ms": roi_time,
            "warped_image": warped_sub_tgt,
        }
        roi_results.append(row)
        save_metrics(row, os.path.join(roi_folder, "metrics.json"))

        status_tag = f"SUCCESS ({inliers_count} inliers, {inlier_ratio:.1f}%, RMSE: {rmse:.2f}px)" if status == "SUCCESS" else f"FAILED - {reason}"
        print(f"ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): {status_tag}")

    # Write summary CSV
    csv_path = os.path.join(output_dir, "roi_summary.csv")
    csv_rows = []
    for r in roi_results:
        clean_row = {k: v for k, v in r.items() if k != "warped_image"}
        csv_rows.append(clean_row)

    if len(csv_rows) > 0:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
            writer.writeheader()
            writer.writerows(csv_rows)
        print(f"\nSaved ROI summary CSV to: {csv_path}")

    # Create Full-Strip Tile Overview Image
    overview_path = os.path.join(output_dir, "tile_overview.jpg")
    create_tile_overview(ref_img, tgt_img, roi_results, overview_path)

    total_time_ms = round((time.perf_counter() - total_start) * 1000, 2)
    successful_count = sum(1 for r in roi_results if r["status"] == "SUCCESS")
    total_inliers = sum(r.get("inlier_matches", 0) for r in roi_results if r["status"] == "SUCCESS")

    successful_rois_list = [r for r in roi_results if r["status"] == "SUCCESS"]
    best_roi = max(successful_rois_list, key=lambda x: x["inlier_matches"]) if len(successful_rois_list) > 0 else None
    best_rmse_roi = min(successful_rois_list, key=lambda x: x["reprojection_rmse_px"]) if len(successful_rois_list) > 0 else None

    summary = {
        "total_rois": len(roi_results),
        "successful_rois": successful_count,
        "failed_rois": len(roi_results) - successful_count,
        "total_inliers": total_inliers,
        "best_roi": f"ROI {best_roi['roi_index']:02d}" if best_roi else "None",
        "best_rmse": best_rmse_roi["reprojection_rmse_px"] if best_rmse_roi else 0.0,
        "best_inlier_ratio": best_roi["inlier_ratio_pct"] if best_roi else 0.0,
        "total_processing_time_ms": total_time_ms,
    }

def validate_homography_geometry(
    H: Optional[np.ndarray], H_global: Optional[np.ndarray] = None
) -> Tuple[bool, str]:
    """
    Perform rigorous geometric sanity checks on estimated local homographies
    to reject degenerate, inverted, or implausibly distorted transformations.
    """
    if H is None:
        return False, "homography is None"

    # 1. Invertibility & Determinant
    det = float(np.linalg.det(H))
    if not np.isfinite(det) or abs(det) < 1e-7 or det <= 0:
        return False, f"degenerate or inverted determinant ({det:.2e})"

    # 2. Scale & Singular values of affine part
    affine_2x2 = H[0:2, 0:2]
    try:
        s1, s2 = np.linalg.svd(affine_2x2, compute_uv=False)
    except Exception:
        return False, "SVD calculation failed on homography"

    if s1 < 0.65 or s1 > 1.50 or s2 < 0.65 or s2 > 1.50:
        return False, f"extreme scale factor (s1={s1:.2f}, s2={s2:.2f})"

    aspect_ratio = float(s1 / max(1e-6, s2))
    if aspect_ratio < 0.65 or aspect_ratio > 1.55:
        return False, f"extreme aspect ratio stretching ({aspect_ratio:.2f})"

    # 3. Perspective distortion (H20, H21)
    p_norm = float(np.linalg.norm(H[2, 0:2]))
    if p_norm > 0.005:
        return False, f"extreme perspective distortion ({p_norm:.2e})"

    # 4. Rotation comparison with global initialization
    if H_global is not None:
        rot_local = float(np.arctan2(H[0, 1] - H[1, 0], H[0, 0] + H[1, 1]) * (180.0 / np.pi))
        rot_global = float(np.arctan2(H_global[0, 1] - H_global[1, 0], H_global[0, 0] + H_global[1, 1]) * (180.0 / np.pi))
        rot_diff = abs(rot_local - rot_global)
        if rot_diff > 14.0:
            return False, f"implausible rotation jump ({rot_diff:.1f} deg relative to global)"

    return True, "valid"


def evaluate_continuity(roi_results: List[Dict[str, Any]], image_width: int = 1200) -> Dict[str, Any]:
    """
    Evaluate geometric transformation continuity across neighboring local ROIs
    by measuring rotation consistency and overlap seam displacement.
    """
    successful = [r for r in roi_results if r.get("status") == "SUCCESS" and r.get("homography") is not None]
    if len(successful) < 2:
        return {
            "neighboring_homography_consistency": "insufficient_rois" if len(successful) == 0 else "single_roi",
            "max_translation_jump_px": 0.0,
            "max_rotation_jump_deg": 0.0,
            "suspicious_rois": [],
        }

    suspicious_rois: List[int] = []
    max_seam_jump = 0.0
    max_rot_jump = 0.0

    for i in range(len(successful) - 1):
        r1, r2 = successful[i], successful[i + 1]
        H1 = np.array(r1["homography"], dtype=np.float64)
        H2 = np.array(r2["homography"], dtype=np.float64)

        # Convert local homographies to global coordinate systems
        S_ref1 = np.array([[1, 0, 0], [0, 1, r1["ref_y1"]], [0, 0, 1]], dtype=np.float64)
        S_tgt1_inv = np.array([[1, 0, 0], [0, 1, -r1["tgt_y1"]], [0, 0, 1]], dtype=np.float64)
        G1 = S_ref1 @ H1 @ S_tgt1_inv

        S_ref2 = np.array([[1, 0, 0], [0, 1, r2["ref_y1"]], [0, 0, 1]], dtype=np.float64)
        S_tgt2_inv = np.array([[1, 0, 0], [0, 1, -r2["tgt_y1"]], [0, 0, 1]], dtype=np.float64)
        G2 = S_ref2 @ H2 @ S_tgt2_inv

        rot1 = float(np.arctan2(G1[0, 1] - G1[1, 0], G1[0, 0] + G1[1, 1]) * (180.0 / np.pi))
        rot2 = float(np.arctan2(G2[0, 1] - G2[1, 0], G2[0, 0] + G2[1, 1]) * (180.0 / np.pi))
        d_rot = abs(rot2 - rot1)
        max_rot_jump = max(max_rot_jump, d_rot)

        # Evaluate overlap seam displacement across the boundary center line
        y_overlap = (r2["ref_y1"] + r1["ref_y2"]) / 2.0
        pts_ref = np.array([[[image_width * 0.2, y_overlap], [image_width * 0.5, y_overlap], [image_width * 0.8, y_overlap]]], dtype=np.float32)

        try:
            G1_inv = np.linalg.inv(G1)
            G2_inv = np.linalg.inv(G2)
            p1 = cv2.perspectiveTransform(pts_ref, G1_inv)[0]
            p2 = cv2.perspectiveTransform(pts_ref, G2_inv)[0]
            dists = np.linalg.norm(p1 - p2, axis=1)
            seam_disp = float(np.max(dists))
        except Exception:
            seam_disp = 999.0

        max_seam_jump = max(max_seam_jump, seam_disp)

        if seam_disp > 180.0 or d_rot > 6.0:
            suspicious_rois.append(r2["roi_index"])

    if len(suspicious_rois) == 0 and max_rot_jump < 4.0 and max_seam_jump < 140.0:
        consistency = "smooth"
    elif len(suspicious_rois) == 0:
        consistency = "moderately_consistent"
    else:
        consistency = "discontinuous"

    return {
        "neighboring_homography_consistency": consistency,
        "max_translation_jump_px": round(float(max_seam_jump), 2),
        "max_rotation_jump_deg": round(float(max_rot_jump), 2),
        "suspicious_rois": suspicious_rois,
    }



def blend_overlapping_rois(
    roi_list: List[Dict[str, Any]], full_h: int, full_w: int, default_overlap: int = 500
) -> np.ndarray:
    """
    Seamlessly stitch overlapping warped ROI images using vertical linear cross-fade blending.
    """
    accum_img = np.zeros((full_h, full_w, 3), dtype=np.float32)
    accum_weight = np.zeros((full_h, full_w, 1), dtype=np.float32)

    for r in roi_list:
        if r.get("status") != "SUCCESS" or r.get("warped_image") is None:
            continue
        ref_y1, ref_y2 = r["ref_y1"], r["ref_y2"]
        cur_roi_h = ref_y2 - ref_y1
        img = r["warped_image"][:cur_roi_h, :full_w].astype(np.float32)

        valid = (np.sum(img, axis=2, keepdims=True) > 0).astype(np.float32)
        if np.sum(valid) == 0:
            continue

        ramp = np.ones((cur_roi_h, full_w, 1), dtype=np.float32)
        fade_len = min(default_overlap, cur_roi_h // 2)

        if ref_y1 > 0 and fade_len > 0:
            ramp[:fade_len, :, 0] = np.linspace(0.0, 1.0, fade_len)[:, None]
        if ref_y2 < full_h and fade_len > 0:
            ramp[-fade_len:, :, 0] = np.linspace(1.0, 0.0, fade_len)[:, None]

        w_eff = ramp * valid
        accum_img[ref_y1:ref_y2, :] += img * w_eff
        accum_weight[ref_y1:ref_y2, :] += w_eff

    mask = accum_weight > 0
    final_img = np.zeros((full_h, full_w, 3), dtype=np.uint8)
    final_img[mask[:, :, 0]] = np.clip(
        accum_img[mask[:, :, 0]] / accum_weight[mask[:, :, 0]], 0, 255
    ).astype(np.uint8)
    return final_img


def run_hybrid_pipeline(
    reference_path: str,
    target_path: str,
    roi_height: int = 2000,
    roi_overlap: int = 500,
    search_margin: int = 500,
    max_features_global: int = 2000,
    max_features_roi: int = 1500,
    ratio_threshold: float = 0.75,
    ransac_threshold: float = 3.0,
    matcher_method: str = "flann",
    cross_check: bool = True,
    min_inliers: int = 30,
    min_inlier_ratio: float = 25.0,
    max_rmse: float = 3.0,
    min_grid_occupancy: float = 12.5,
    output_dir: str = "output/hybrid",
    save_visualizations: bool = True,
) -> Tuple[bool, Dict[str, Any], List[Dict[str, Any]]]:
    """
    Execute the Production Hybrid Registration Pipeline:
    1. Global SIFT coarse alignment & dynamic displacement estimation.
    2. Dynamic overlapping ROI generation and target search window assignment.
    3. Independent local multi-tile feature extraction, matching, and geometric verification.
    4. Transformation continuity & geometric sanity checks.
    5. Overlapping linear cross-fade mosaic blending.
    6. Complete quantitative metrics export.
    """
    total_start = time.perf_counter()
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n=======================================================")
    print(f"   LunaReg SIH26166 Hybrid Registration Pipeline")
    print(f"=======================================================\n")
    print(f"Reference: {reference_path}")
    print(f"Target:    {target_path}")
    print(f"Output:    {output_dir}/\n")

    # 1. Load Images
    ref_img = load_image(reference_path)
    tgt_img = load_image(target_path)
    h_ref, w_ref = ref_img.shape[:2]
    h_tgt, w_tgt = tgt_img.shape[:2]

    # Preprocessing
    _, ref_enh, ref_mask = preprocess_image(ref_img, use_clahe=True, clip_limit=3.0)
    _, tgt_enh, tgt_mask = preprocess_image(tgt_img, use_clahe=True, clip_limit=3.0)

    # 2. Global Coarse Initialization
    print("[1/4] Running global coarse initialization ...", flush=True)
    kp_ref_g, des_ref_g = detect_features(ref_enh, mask=ref_mask, max_features=max_features_global)
    kp_tgt_g, des_tgt_g = detect_features(tgt_enh, mask=tgt_mask, max_features=max_features_global)

    good_matches_g, _ = match_features(
        des_ref_g, des_tgt_g, method=matcher_method, ratio_threshold=ratio_threshold, cross_check=cross_check
    )

    H_global = None
    inliers_g_count = 0
    inlier_ratio_g = 0.0
    rmse_g = 0.0
    med_dy = -380.0
    med_dx = 0.0

    if len(good_matches_g) >= 4:
        H_global, inlier_mask_g, src_g, dst_g = estimate_homography(
            kp_ref_g, kp_tgt_g, good_matches_g, ransac_threshold=ransac_threshold
        )
        if H_global is not None and inlier_mask_g is not None:
            inliers_g_count = int(np.sum(inlier_mask_g))
            inlier_ratio_g = round((inliers_g_count / len(good_matches_g)) * 100.0, 2)
            rmse_g, _, _, _ = calculate_reprojection_error(src_g, dst_g, H_global, inlier_mask_g)
            inlier_bool_g = inlier_mask_g.astype(bool)
            inlier_src_g = src_g[inlier_bool_g].reshape(-1, 2)
            inlier_dst_g = dst_g[inlier_bool_g].reshape(-1, 2)
            dy_vals = inlier_dst_g[:, 1] - inlier_src_g[:, 1]
            dx_vals = inlier_dst_g[:, 0] - inlier_src_g[:, 0]
            if len(dy_vals) > 0:
                med_dy = float(np.median(dy_vals))
                med_dx = float(np.median(dx_vals))

    global_init_status = "SUCCESS" if (H_global is not None and inliers_g_count >= 30) else "FAILED"
    print(f"      Global status: {global_init_status} ({inliers_g_count} inliers, {inlier_ratio_g}%, RMSE: {rmse_g:.2f}px, dy: {med_dy:.1f}px)")

    # Prepare H_inv for dynamic search window projection
    H_inv = None
    if H_global is not None:
        try:
            H_inv = np.linalg.inv(H_global)
        except Exception:
            H_inv = None

    # 3. Dynamic ROI Partitioning & Target Window Assignment
    print("\n[2/4] Executing local multi-tile registration ...", flush=True)
    step = roi_height - roi_overlap
    y_starts = list(range(0, h_ref - roi_overlap, step))
    if len(y_starts) == 0 or (y_starts[-1] + roi_height < h_ref):
        y_starts.append(max(0, h_ref - roi_height))

    roi_results: List[Dict[str, Any]] = []
    all_inlier_pts_ref: List[np.ndarray] = []

    for i, ref_y1 in enumerate(y_starts, 1):
        roi_start = time.perf_counter()
        ref_y2 = min(h_ref, ref_y1 + roi_height)
        cur_roi_h = ref_y2 - ref_y1

        # Dynamic target window calculation
        if H_inv is not None:
            pts_ref = np.array([[[0, ref_y1], [w_ref, ref_y1], [0, ref_y2], [w_ref, ref_y2]]], dtype=np.float32)
            pts_tgt = cv2.perspectiveTransform(pts_ref, H_inv)[0]
            min_tgt_y = float(np.min(pts_tgt[:, 1]))
            max_tgt_y = float(np.max(pts_tgt[:, 1]))
            tgt_y1 = max(0, int(round(min_tgt_y - search_margin)))
            tgt_y2 = min(h_tgt, int(round(max_tgt_y + search_margin)))
        else:
            tgt_y1 = max(0, int(round(ref_y1 - med_dy - search_margin)))
            tgt_y2 = min(h_tgt, int(round(ref_y2 - med_dy + search_margin)))

        sub_ref = ref_enh[ref_y1:ref_y2, :]
        sub_tgt = tgt_enh[tgt_y1:tgt_y2, :]
        sub_ref_mask = ref_mask[ref_y1:ref_y2, :] if ref_mask is not None else None
        sub_tgt_mask = tgt_mask[tgt_y1:tgt_y2, :] if tgt_mask is not None else None
        sub_ref_bgr = ref_img[ref_y1:ref_y2, :]
        sub_tgt_bgr = tgt_img[tgt_y1:tgt_y2, :]

        kp_ref_l, des_ref_l = detect_features(sub_ref, mask=sub_ref_mask, max_features=max_features_roi)
        kp_tgt_l, des_tgt_l = detect_features(sub_tgt, mask=sub_tgt_mask, max_features=max_features_roi)

        ref_kp_count = len(kp_ref_l)
        tgt_kp_count = len(kp_tgt_l)

        if ref_kp_count < 4 or tgt_kp_count < 4 or des_ref_l is None or des_tgt_l is None:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": "insufficient keypoints detected",
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": 0,
                "good_matches": 0,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "no_inliers",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            print(f"      ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - insufficient keypoints")
            continue

        good_matches_l, init_count_l = match_features(
            des_ref_l, des_tgt_l, method=matcher_method, ratio_threshold=ratio_threshold, cross_check=cross_check
        )
        good_count_l = len(good_matches_l)

        if good_count_l < 4:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": f"insufficient correspondences ({good_count_l} < 4)",
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": init_count_l,
                "good_matches": good_count_l,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "insufficient_matches",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            print(f"      ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - insufficient correspondences")
            continue

        H_local, inlier_mask_l, src_l, dst_l = estimate_homography(
            kp_ref_l, kp_tgt_l, good_matches_l, ransac_threshold=ransac_threshold
        )

        # Geometric sanity check
        is_geom_valid, geom_reason = validate_homography_geometry(H_local, H_global=H_global)

        if H_local is None or inlier_mask_l is None or not is_geom_valid:
            roi_time = round((time.perf_counter() - roi_start) * 1000, 2)
            fail_reason = geom_reason if not is_geom_valid else "RANSAC homography estimation failed"
            row = {
                "roi_index": i,
                "status": "FAILED",
                "reason": fail_reason,
                "ref_y1": ref_y1,
                "ref_y2": ref_y2,
                "tgt_y1": tgt_y1,
                "tgt_y2": tgt_y2,
                "ref_kp": ref_kp_count,
                "tgt_kp": tgt_kp_count,
                "initial_matches": init_count_l,
                "good_matches": good_count_l,
                "inlier_matches": 0,
                "inlier_ratio_pct": 0.0,
                "reprojection_rmse_px": 0.0,
                "median_error_px": 0.0,
                "max_error_px": 0.0,
                "grid_occupancy_pct": 0.0,
                "bbox_coverage_pct": 0.0,
                "spatial_assessment": "geometric_failure",
                "homography": None,
                "processing_time_ms": roi_time,
                "warped_image": None,
            }
            roi_results.append(row)
            print(f"      ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): FAILED - {fail_reason}")
            continue

        inliers_count_l = int(np.sum(inlier_mask_l))
        inlier_ratio_l = round((inliers_count_l / good_count_l) * 100.0, 2) if good_count_l > 0 else 0.0
        rmse_l, med_err_l, max_err_l, _ = calculate_reprojection_error(src_l, dst_l, H_local, inlier_mask_l)

        inlier_bool_l = inlier_mask_l.astype(bool)
        inlier_pts_local = dst_l[inlier_bool_l].reshape(-1, 2)
        spatial_analysis = analyze_spatial_distribution(inlier_pts_local, w_ref, cur_roi_h, grid_rows=4, grid_cols=4)
        grid_occ = spatial_analysis.get("grid_occupancy_ratio", 0.0)

        # Quality Gates
        if inliers_count_l < min_inliers:
            status = "FAILED"
            reason = f"insufficient inliers ({inliers_count_l} < {min_inliers})"
        elif inlier_ratio_l < min_inlier_ratio:
            status = "FAILED"
            reason = f"low inlier ratio ({inlier_ratio_l:.1f}% < {min_inlier_ratio:.1f}%)"
        elif rmse_l > max_rmse:
            status = "FAILED"
            reason = f"high reprojection RMSE ({rmse_l:.2f}px > {max_rmse:.2f}px)"
        elif grid_occ < min_grid_occupancy:
            status = "FAILED"
            reason = f"concentrated in tiny area ({grid_occ:.1f}%)"
        else:
            status = "SUCCESS"
            reason = "passed all quality criteria"

        warped_sub_tgt = warp_image(sub_tgt_bgr, H_local, (w_ref, cur_roi_h))
        roi_time = round((time.perf_counter() - roi_start) * 1000, 2)

        # Collect global coordinate inliers for full-strip spatial metrics
        if status == "SUCCESS":
            inlier_global = inlier_pts_local.copy()
            inlier_global[:, 1] += ref_y1
            all_inlier_pts_ref.append(inlier_global)

        row = {
            "roi_index": i,
            "status": status,
            "reason": reason,
            "ref_y1": ref_y1,
            "ref_y2": ref_y2,
            "tgt_y1": tgt_y1,
            "tgt_y2": tgt_y2,
            "ref_kp": ref_kp_count,
            "tgt_kp": tgt_kp_count,
            "initial_matches": init_count_l,
            "good_matches": good_count_l,
            "inlier_matches": inliers_count_l,
            "inlier_ratio_pct": inlier_ratio_l,
            "reprojection_rmse_px": round(rmse_l, 4),
            "median_error_px": round(med_err_l, 4),
            "max_error_px": round(max_err_l, 4),
            "grid_occupancy_pct": grid_occ,
            "bbox_coverage_pct": spatial_analysis.get("bbox_coverage_pct", 0.0),
            "spatial_assessment": spatial_analysis.get("assessment", "unknown"),
            "homography": H_local.tolist() if H_local is not None else None,
            "processing_time_ms": roi_time,
            "warped_image": warped_sub_tgt,
        }
        roi_results.append(row)
        status_tag = f"SUCCESS ({inliers_count_l} inliers, {inlier_ratio_l:.1f}%, RMSE: {rmse_l:.2f}px)" if status == "SUCCESS" else f"FAILED - {reason}"
        print(f"      ROI {i:02d} (Y:{ref_y1:5d}..{ref_y2:5d}): {status_tag}")

    # 4. Evaluate Neighbor Continuity & Suspicious ROIs
    print("\n[3/4] Evaluating transformation continuity across ROIs ...", flush=True)
    continuity_report = evaluate_continuity(roi_results)
    print(f"      Continuity: {continuity_report['neighboring_homography_consistency']} | Max translation jump: {continuity_report['max_translation_jump_px']} px | Suspicious ROIs: {len(continuity_report['suspicious_rois'])}")

    # 5. Overlapping Linear Cross-Fade Mosaic Blending
    print("\n[4/4] Blending full-strip registered mosaic and rendering artifacts ...", flush=True)
    final_registered = blend_overlapping_rois(roi_results, h_ref, w_ref, default_overlap=roi_overlap)
    final_overlay = create_overlay(ref_img, final_registered, alpha=0.5)
    final_difference = create_difference_image(ref_img, final_registered)

    # Compute Global Spatial Coverage over all inliers
    if len(all_inlier_pts_ref) > 0:
        stacked_inliers = np.vstack(all_inlier_pts_ref)
        full_spatial = analyze_spatial_distribution(stacked_inliers, w_ref, h_ref, grid_rows=8, grid_cols=4)
        total_inliers_count = len(stacked_inliers)
    else:
        full_spatial = analyze_spatial_distribution(np.empty((0, 2)), w_ref, h_ref, grid_rows=8, grid_cols=4)
        total_inliers_count = 0

    # Save artifacts
    if save_visualizations:
        cv2.imwrite(os.path.join(output_dir, "registered.jpg"), final_registered, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(output_dir, "overlay.jpg"), final_overlay, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(output_dir, "difference.jpg"), final_difference, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if len(good_matches_g) > 0 and inlier_mask_g is not None:
            matches_vis = create_match_visualization(
                ref_img, tgt_img, kp_ref_g, kp_tgt_g, good_matches_g, inlier_mask_g, spatial_info=full_spatial, rmse=rmse_g
            )
            cv2.imwrite(os.path.join(output_dir, "matches.jpg"), matches_vis, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # Generate Full-Strip Tile Overview
    create_tile_overview(ref_img, tgt_img, roi_results, os.path.join(output_dir, "tile_overview.jpg"))


    # Summary Statistics
    successful_rois = [r for r in roi_results if r["status"] == "SUCCESS"]
    success_count = len(successful_rois)
    failed_count = len(roi_results) - success_count

    mean_inlier_ratio = round(float(np.mean([r["inlier_ratio_pct"] for r in successful_rois])), 2) if success_count > 0 else 0.0
    median_rmse = round(float(np.median([r["reprojection_rmse_px"] for r in successful_rois])), 4) if success_count > 0 else 0.0
    mean_rmse = round(float(np.mean([r["reprojection_rmse_px"] for r in successful_rois])), 4) if success_count > 0 else 0.0

    # Calculate Confidence Score (0-100)
    score_roi = (success_count / max(1, len(roi_results))) * 40.0
    score_ratio = min(1.0, mean_inlier_ratio / 80.0) * 25.0
    score_rmse = max(0.0, 1.0 - (median_rmse / 3.0)) * 20.0
    score_cont = 15.0 if continuity_report["neighboring_homography_consistency"] == "smooth" else (8.0 if continuity_report["neighboring_homography_consistency"] == "moderately_consistent" else 0.0)
    confidence_score = round(score_roi + score_ratio + score_rmse + score_cont, 1)

    if confidence_score >= 75.0 and failed_count == 0:
        final_status = "SUCCESS"
    elif confidence_score >= 50.0:
        final_status = "REVIEW"
    else:
        final_status = "FAILED"

    total_time_ms = round((time.perf_counter() - total_start) * 1000, 2)

    # Compile Structured metrics.json
    metrics_payload: Dict[str, Any] = {
        "mode": "hybrid",
        "global_initialization": {
            "status": global_init_status,
            "homography": H_global.tolist() if H_global is not None else None,
            "inliers": inliers_g_count,
            "inlier_ratio": inlier_ratio_g,
            "rmse": round(rmse_g, 4),
            "estimated_vertical_offset": round(med_dy, 2),
            "estimated_horizontal_offset": round(med_dx, 2),
        },
        "local_registration": {
            "total_rois": len(roi_results),
            "successful_rois": success_count,
            "failed_rois": failed_count,
            "total_inliers": total_inliers_count,
            "mean_inlier_ratio": mean_inlier_ratio,
            "median_rmse": median_rmse,
            "mean_rmse": mean_rmse,
            "spatial_coverage": full_spatial.get("bbox_coverage_pct", 0.0),
            "grid_occupancy": full_spatial.get("grid_occupancy_ratio", 0.0),
        },
        "continuity": {
            "neighboring_homography_consistency": continuity_report["neighboring_homography_consistency"],
            "max_translation_jump_px": continuity_report["max_translation_jump_px"],
            "max_rotation_jump_deg": continuity_report["max_rotation_jump_deg"],
            "suspicious_rois": continuity_report["suspicious_rois"],
        },
        "final_quality": {
            "accepted": (final_status == "SUCCESS"),
            "confidence_score": confidence_score,
            "status": final_status,
        },
        "parameters": {
            "roi_height": roi_height,
            "roi_overlap": roi_overlap,
            "search_margin": search_margin,
            "max_features_global": max_features_global,
            "max_features_roi": max_features_roi,
            "ratio_threshold": ratio_threshold,
            "ransac_threshold": ransac_threshold,
            "matcher_method": matcher_method,
            "cross_check": cross_check,
            "min_inliers": min_inliers,
            "min_inlier_ratio": min_inlier_ratio,
            "max_rmse": max_rmse,
        },
        "processing_time_ms": total_time_ms,
    }

    save_metrics(metrics_payload, os.path.join(output_dir, "metrics.json"))

    # Save roi_summary.csv
    csv_path = os.path.join(output_dir, "roi_summary.csv")
    csv_rows = []
    for r in roi_results:
        clean_row = {k: v for k, v in r.items() if k != "warped_image"}
        csv_rows.append(clean_row)
    if len(csv_rows) > 0:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
            writer.writeheader()
            writer.writerows(csv_rows)

    print(f"\nSaved hybrid registration metrics and artifacts to: {output_dir}/\n")
    return (final_status == "SUCCESS"), metrics_payload, roi_results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="LunaReg Standalone Computer-Vision Registration Engine (SIH26166)"
    )
    parser.add_argument(
        "--mode",
        type=str,
        default="global",
        choices=["global", "roi", "tiles", "hybrid"],
        help="Registration mode: 'global' (full-image), 'roi'/'tiles' (multi-tile), or 'hybrid' (coarse-to-fine blended) (default: global)",
    )
    parser.add_argument(
        "--reference",
        type=str,
        default="backend/test_images/reference.png",
        help="Path to reference (fixed) lunar image",
    )
    parser.add_argument(
        "--target",
        type=str,
        default="backend/test_images/target.png",
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
        help="Maximum SIFT keypoints to detect per image/ROI (default: 2000)",
    )
    parser.add_argument(
        "--matcher",
        type=str,
        default="flann",
        choices=["flann", "bf"],
        help="Feature matching algorithm (default: flann)",
    )
    parser.add_argument(
        "--cross-check",
        action="store_true",
        default=True,
        help="Enable mutual nearest-neighbor consistency check (default: True)",
    )
    parser.add_argument(
        "--no-cross-check",
        dest="cross_check",
        action="store_false",
        help="Disable mutual nearest-neighbor consistency check",
    )
    parser.add_argument(
        "--clahe-clip",
        type=float,
        default=3.0,
        help="CLAHE contrast clip limit (default: 3.0)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="backend/output",
        help="Directory to save output images and metrics (default: backend/output)",
    )
    parser.add_argument(
        "--run-benchmark",
        action="store_true",
        help="Run comprehensive benchmark suite testing parameter combinations",
    )
    parser.add_argument(
        "--benchmark-dir",
        type=str,
        default="backend/experiments",
        help="Directory for saving benchmark experiment outputs (default: backend/experiments)",
    )

    # ROI / Tile / Hybrid Mode arguments
    parser.add_argument(
        "--roi-height",
        type=int,
        default=2000,
        help="Height of horizontal ROIs in pixels (default: 2000)",
    )
    parser.add_argument(
        "--roi-overlap",
        type=int,
        default=500,
        help="Overlap between adjacent ROIs in pixels (default: 500)",
    )
    parser.add_argument(
        "--vertical-offset",
        type=float,
        default=-380.0,
        help="Manual vertical displacement offset for ROI mode in pixels (default: -380.0)",
    )
    parser.add_argument(
        "--search-margin",
        type=int,
        default=500,
        help="Target search margin around estimated offset in pixels (default: 500)",
    )
    parser.add_argument(
        "--min-inliers",
        type=int,
        default=30,
        help="Minimum inliers required for usable ROI registration (default: 30)",
    )
    parser.add_argument(
        "--min-inlier-ratio",
        type=float,
        default=25.0,
        help="Minimum inlier ratio %% for usable ROI registration (default: 25.0)",
    )
    parser.add_argument(
        "--max-rmse",
        type=float,
        default=3.0,
        help="Maximum allowable reprojection RMSE for usable ROI registration (default: 3.0)",
    )

    args = parser.parse_args()

    # Benchmark mode
    if args.run_benchmark:
        run_benchmark_experiments(
            reference_path=args.reference,
            target_path=args.target,
            experiments_dir=args.benchmark_dir,
        )
        return

    # Hybrid Mode
    if args.mode.lower() == "hybrid":
        out_dir = "backend/output/hybrid" if args.output_dir == "backend/output" else args.output_dir
        success, metrics, roi_results = run_hybrid_pipeline(
            reference_path=args.reference,
            target_path=args.target,
            roi_height=args.roi_height,
            roi_overlap=args.roi_overlap,
            search_margin=args.search_margin,
            max_features_global=args.max_features,
            max_features_roi=1500,
            ratio_threshold=args.ratio,
            ransac_threshold=args.ransac_threshold,
            matcher_method=args.matcher,
            cross_check=args.cross_check,
            min_inliers=args.min_inliers,
            min_inlier_ratio=args.min_inlier_ratio,
            max_rmse=args.max_rmse,
            output_dir=out_dir,
            save_visualizations=True,
        )

        local_m = metrics["local_registration"]
        cont_m = metrics["continuity"]
        qual_m = metrics["final_quality"]

        print("LunaReg Hybrid Registration")
        print("---------------------------")
        print(f"Global initialization:   {metrics['global_initialization']['status']}")
        print(f"Local ROIs:              {local_m['successful_rois']}/{local_m['total_rois']} successful")
        print(f"Total local inliers:     {local_m['total_inliers']}")
        print(f"Mean local inlier ratio: {local_m['mean_inlier_ratio']}%")
        print(f"Median local RMSE:       {local_m['median_rmse']} px")
        print(f"Spatial coverage:        {local_m['spatial_coverage']}%")
        print(f"Suspicious ROIs:         {len(cont_m['suspicious_rois'])}")
        print(f"Confidence Score:        {qual_m['confidence_score']}/100")
        print(f"Final status:            {qual_m['status']}\n")
        return

    # ROI / Tiles Mode
    if args.mode.lower() in ["roi", "tiles"]:
        summary, roi_results = run_roi_pipeline(
            reference_path=args.reference,
            target_path=args.target,
            roi_height=args.roi_height,
            roi_overlap=args.roi_overlap,
            vertical_offset=args.vertical_offset,
            search_margin=args.search_margin,
            max_features_per_roi=args.max_features,
            ratio_threshold=args.ratio,
            ransac_threshold=args.ransac_threshold,
            matcher_method=args.matcher,
            cross_check=args.cross_check,
            min_inliers=args.min_inliers,
            min_inlier_ratio=args.min_inlier_ratio,
            max_rmse=args.max_rmse,
            output_dir=os.path.join(args.benchmark_dir, "tiles") if args.output_dir == "backend/output" else args.output_dir,
            save_visualizations=True,
        )

        print("\n=======================================================")
        print("ROI Registration Summary")
        print("-------------------------------------------------------")
        for r in roi_results:
            idx = r["roi_index"]
            st = r["status"]
            y1, y2 = r["ref_y1"], r["ref_y2"]
            if st == "SUCCESS":
                inl = r["inlier_matches"]
                rat = r["inlier_ratio_pct"]
                err = r["reprojection_rmse_px"]
                print(f"ROI {idx:02d} (Y:{y1:5d}..{y2:5d}): SUCCESS ({inl} inliers, {rat:.1f}%, RMSE: {err:.2f}px)")
            else:
                rsn = r.get("reason", "failed")
                print(f"ROI {idx:02d} (Y:{y1:5d}..{y2:5d}): FAILED - {rsn}")

        print("-------------------------------------------------------")
        print(f"Successful ROIs:     {summary['successful_rois']} / {summary['total_rois']}")
        print(f"Total local inliers: {summary['total_inliers']}")
        print(f"Best ROI:            {summary['best_roi']}")
        print(f"Best RMSE:           {summary['best_rmse']:.2f} px")
        print(f"Best inlier ratio:   {summary['best_inlier_ratio']:.1f}%")
        print(f"Total time:          {summary['total_processing_time_ms']:.1f} ms\n")
        return

    # Global mode
    try:
        success, metrics = run_pipeline(
            reference_path=args.reference,
            target_path=args.target,
            ratio_threshold=args.ratio,
            ransac_threshold=args.ransac_threshold,
            max_features=args.max_features,
            matcher_method=args.matcher,
            cross_check=args.cross_check,
            use_clahe=True,
            clahe_clip_limit=args.clahe_clip,
            output_dir=args.output_dir,
            save_visualizations=True,
        )
    except Exception as e:
        print(f"Registration Error: {e}", file=sys.stderr)
        sys.exit(1)

    spatial = metrics.get("spatial_distribution", {})
    bbox = spatial.get("bbox", {})

    print("\n## LunaReg Registration\n")
    print(f"Reference keypoints:       {metrics.get('reference_keypoints', 0)}")
    print(f"Target keypoints:          {metrics.get('target_keypoints', 0)}")
    print(f"Initial matches:           {metrics.get('initial_matches', 0)}")
    print(f"Good matches:              {metrics.get('good_matches', 0)}")
    print(f"RANSAC inliers:            {metrics.get('inlier_matches', 0)}")
    print(f"Inlier ratio:              {metrics.get('inlier_ratio', 0.0)}%")
    print(f"Reprojection RMSE:         {metrics.get('reprojection_rmse', 0.0)} px")
    print(f"Median Reprojection Error: {metrics.get('median_reprojection_error', 0.0)} px")
    print(f"Max Reprojection Error:    {metrics.get('max_reprojection_error', 0.0)} px")
    print(f"Inlier Spatial Coverage:   {spatial.get('bbox_coverage_pct', 0.0)}% (BBox: {bbox.get('width', 0)}x{bbox.get('height', 0)} px)")
    print(f"Grid Occupancy:            {spatial.get('grid_occupancy_ratio', 0.0)}% ({spatial.get('occupied_grid_cells', 0)}/{spatial.get('total_grid_cells', 0)} cells)")
    print(f"Spatial Assessment:        {spatial.get('assessment', 'unknown')}")
    print(f"Processing time:           {metrics.get('processing_time_ms', 0.0)} ms\n")

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
