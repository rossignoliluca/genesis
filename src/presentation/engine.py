#!/usr/bin/env python3
"""
Genesis Presentation Engine — Main Entry Point

Reads a PresentationSpec JSON from stdin, generates a PPTX file,
and prints the result JSON to stdout.

Usage:
  echo '{"meta": {...}, "slides": [...], "output_path": "/tmp/out.pptx"}' | python3 engine.py

Output (stdout):
  {"success": true, "path": "/tmp/out.pptx", "slides": 15, "charts": 10}
"""

import json
import os
import sys
import time
import traceback

# Ensure this module's directory is in the path for sibling imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pptx import Presentation
from pptx.util import Inches

from design import get_palette, setup_matplotlib, ColorPalette
from charts import render_chart
from templates import (
    build_cover,
    build_executive_summary,
    build_chart_slide,
    build_text_slide,
    build_sources_slide,
    build_back_cover,
    build_section_divider,
    build_kpi_dashboard,
    build_news_slide,
    build_image_slide,
    build_dual_chart_slide,
    build_callout_slide,
)


def _normalize_chart_spec(chart_spec: dict):
    """
    Normalize chart spec to match the format expected by charts.py renderers.
    Handles: annotations, reference_line, gauge zones, bar data formats.
    """
    chart_type = chart_spec.get("type", "")
    data = chart_spec.get("data", {})
    config = chart_spec.get("config", {})
    labels = data.get("labels", [])

    # 1. Convert reference_line → hlines
    ref = config.pop("reference_line", None)
    if ref:
        hlines = config.get("hlines", [])
        hlines.append({
            "y": ref["value"],
            "label": ref.get("label", ""),
            "color": ref.get("color", "#F0B90B"),
            "style": "--"
        })
        config["hlines"] = hlines

    # 2. Convert x/y annotations → xy tuples
    for ann in config.get("annotations", []):
        if "xy" not in ann and "x" in ann and "y" in ann:
            x_val = ann.pop("x")
            y_val = ann.pop("y")

            if chart_type in ("bar", "line", "stacked_bar"):
                # Integer x-axis; convert label to index
                if isinstance(x_val, str) and x_val in labels:
                    x_val = labels.index(x_val)
                ann["xy"] = (x_val, y_val)
            elif chart_type in ("hbar",):
                # Hbar: x=value, y=label → convert y to index
                if isinstance(y_val, str) and y_val in labels:
                    y_val = labels.index(y_val)
                ann["xy"] = (x_val, y_val)
            else:
                ann["xy"] = (x_val, y_val)

    # 3. Normalize gauge data: range → start/end, max → max_value
    if chart_type == "gauge":
        if "max" in data and "max_value" not in data:
            data["max_value"] = data.pop("max")
        for zone in data.get("zones", []):
            if "range" in zone and "start" not in zone:
                r = zone.pop("range")
                zone["start"] = r[0]
                zone["end"] = r[1]
            # Ensure border color exists
            if "border" not in zone:
                zone["border"] = zone.get("color", "#666666")

    # 4. Normalize donut_matrix: convert allocations to donut+matrix format
    if chart_type == "donut_matrix":
        allocs = data.get("allocations", [])
        if allocs and "donut" not in data:
            default_colors = [
                "#003366", "#117ACA", "#5B9BD5", "#2E865F",
                "#E8792B", "#B8860B", "#666666", "#A5A5A5"
            ]
            data["donut"] = {
                "labels": [f"{a['name']}\n{a.get('pct', a.get('value', 0))}%" for a in allocs],
                "sizes": [a.get("pct", a.get("value", 0)) for a in allocs],
                "colors": default_colors[:len(allocs)],
                "center_text": "Model\nPortfolio"
            }
            conv_map = {"Very High": "OW+", "High": "OW", "Medium": "N", "Low": "UW"}
            data["matrix"] = {
                "headers": ["Asset Class", "View", "Chg", "Rationale"],
                "rows": [
                    [a["name"], conv_map.get(a.get("conviction", "Medium"), "N"),
                     "—", a.get("change", "")]
                    for a in allocs
                ]
            }
            data.pop("allocations", None)


def _normalize_table_heatmap(chart_spec: dict):
    """Convert inline '---' separator rows to separators index list."""
    data = chart_spec.get("data", {})
    rows = data.get("rows", [])
    if not rows:
        return

    # Find separator rows (first cell is "---")
    sep_indices = []
    clean_rows = []
    offset = 0
    for i, row in enumerate(rows):
        if row[0] in ("---", "—"):
            sep_indices.append(i - offset)
            offset += 1
        else:
            clean_rows.append(row)

    if sep_indices:
        data["rows"] = clean_rows
        data["separators"] = sep_indices

    # Set sensible defaults for 6-column scoreboard
    config = chart_spec.get("config", {})
    headers = data.get("headers", [])
    if len(headers) == 6 and "col_widths" not in config:
        config["col_widths"] = [2.2, 1.2, 0.9, 0.9, 0.9, 1.2]
        config["color_cols"] = [2, 3, 4, 5]
        config["signal_col"] = 5
        chart_spec["config"] = config


def generate(spec: dict) -> dict:
    """
    Generate a PPTX presentation from a spec dict.

    spec:
      meta:
        title: str
        company: str
        date: str
        header_tag: str
        footer_left: str
        footer_center: str
        palette: str (palette name, default "crossinvest_navy_gold")
        slide_width: float (inches, default 13.333)
        slide_height: float (inches, default 7.5)
      design:  (optional, overrides for palette colors)
        navy: str
        gold: str
        ...
      slides: [
        {
          type: "cover" | "executive_summary" | "chart" | "text" | "sources" | "back_cover"
          content: dict  (type-specific content)
          chart: dict    (optional, chart spec for "chart" type slides)
        }
      ]
      output_path: str
    """
    start_time = time.time()

    meta = spec.get("meta", {})
    output_path = spec.get("output_path", "/tmp/presentation.pptx")
    chart_dir = spec.get("chart_dir", "/tmp/genesis_charts")

    # Ensure output and chart directories exist
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    os.makedirs(chart_dir, exist_ok=True)

    # Setup palette
    palette_name = meta.get("palette", "crossinvest_navy_gold")
    palette = get_palette(palette_name)

    # Apply design overrides if provided
    design_overrides = spec.get("design", {})
    for key, value in design_overrides.items():
        if hasattr(palette, key):
            setattr(palette, key, value)

    # Setup matplotlib
    setup_matplotlib(palette)

    # Create presentation
    prs = Presentation()
    slide_w = meta.get("slide_width", 13.333)
    slide_h = meta.get("slide_height", 7.5)
    prs.slide_width = Inches(slide_w)
    prs.slide_height = Inches(slide_h)

    # Background images (AI-generated or custom)
    bg_images = meta.get("bg_images", {})
    bg_cover = bg_images.get("cover")
    bg_content = bg_images.get("content")
    bg_chart = bg_images.get("chart", bg_content)  # fallback to content bg

    # Track stats
    slide_count = 0
    chart_count = 0
    page_num = 0

    # Process slides
    slides = spec.get("slides", [])
    for slide_spec in slides:
        slide_type = slide_spec.get("type", "text")
        content = slide_spec.get("content", {})

        if slide_type == "cover":
            build_cover(prs, content, palette, bg_image=bg_cover)
            slide_count += 1

        elif slide_type == "executive_summary":
            page_num += 1
            build_executive_summary(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "chart":
            page_num += 1
            chart_spec = slide_spec.get("chart", {})
            chart_num = slide_spec.get("chart_num", chart_count + 1)

            # Normalize chart spec to match renderer expectations
            _normalize_chart_spec(chart_spec)

            # Special: table_heatmap separator row normalization
            if chart_spec.get("type") == "table_heatmap":
                _normalize_table_heatmap(chart_spec)

            # Render the chart
            chart_path = render_chart(chart_spec, palette, chart_dir)
            chart_count += 1

            # Build the slide
            build_chart_slide(prs, content, chart_path, chart_num, palette, meta, page_num, bg_image=bg_chart)
            slide_count += 1

        elif slide_type == "text":
            page_num += 1
            build_text_slide(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "sources":
            page_num += 1
            # Normalize list sources to newline-separated strings
            for key in ("left_sources", "right_sources"):
                if isinstance(content.get(key), list):
                    content[key] = "\n".join(f"• {s}" for s in content[key])
            build_sources_slide(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "section_divider":
            # Section dividers use per-slide bg_image if provided, else cover bg
            divider_bg = slide_spec.get("bg_image") or bg_cover
            build_section_divider(prs, content, palette, bg_image=divider_bg)
            slide_count += 1

        elif slide_type == "kpi_dashboard":
            page_num += 1
            build_kpi_dashboard(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "news":
            page_num += 1
            build_news_slide(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "image":
            page_num += 1
            build_image_slide(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "dual_chart":
            page_num += 1
            chart_specs = slide_spec.get("charts", [])
            chart_paths_dual = []
            for cs in chart_specs:
                _normalize_chart_spec(cs)
                cp = render_chart(cs, palette, chart_dir)
                chart_paths_dual.append(cp)
                chart_count += 1
            build_dual_chart_slide(prs, content, chart_paths_dual, palette, meta, page_num, bg_image=bg_chart)
            slide_count += 1

        elif slide_type == "callout":
            page_num += 1
            build_callout_slide(prs, content, palette, meta, page_num, bg_image=bg_content)
            slide_count += 1

        elif slide_type == "back_cover":
            build_back_cover(prs, content, palette, bg_image=bg_cover)
            slide_count += 1

        else:
            # Unknown slide type — skip with warning on stderr
            print(f"WARNING: Unknown slide type '{slide_type}', skipping", file=sys.stderr)

    # Save presentation
    prs.save(output_path)

    duration = round(time.time() - start_time, 2)

    return {
        "success": True,
        "path": output_path,
        "slides": slide_count,
        "charts": chart_count,
        "duration": duration,
    }


def main():
    """Read JSON from stdin, generate presentation, print result to stdout."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            result = {"success": False, "error": "Empty input", "slides": 0, "charts": 0}
            print(json.dumps(result))
            sys.exit(1)

        spec = json.loads(raw)
        result = generate(spec)
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        result = {"success": False, "error": f"Invalid JSON: {str(e)}", "slides": 0, "charts": 0}
        print(json.dumps(result))
        sys.exit(1)

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        result = {"success": False, "error": str(e), "slides": 0, "charts": 0}
        print(json.dumps(result))
        sys.exit(1)


if __name__ == "__main__":
    main()
