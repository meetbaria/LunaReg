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
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)


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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="LunaReg Standalone Computer-Vision Registration Engine (SIH26166)"
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
        help="Maximum SIFT keypoints to detect per image (default: 2000)",
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

    args = parser.parse_args()

    if args.run_benchmark:
        run_benchmark_experiments(
            reference_path=args.reference,
            target_path=args.target,
            experiments_dir=args.benchmark_dir,
        )
        return

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
