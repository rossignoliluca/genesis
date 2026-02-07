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
)


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
            build_cover(prs, content, palette)
            slide_count += 1

        elif slide_type == "executive_summary":
            page_num += 1
            build_executive_summary(prs, content, palette, meta, page_num)
            slide_count += 1

        elif slide_type == "chart":
            page_num += 1
            chart_spec = slide_spec.get("chart", {})
            chart_num = slide_spec.get("chart_num", chart_count + 1)

            # Render the chart
            chart_path = render_chart(chart_spec, palette, chart_dir)
            chart_count += 1

            # Build the slide
            build_chart_slide(prs, content, chart_path, chart_num, palette, meta, page_num)
            slide_count += 1

        elif slide_type == "text":
            page_num += 1
            build_text_slide(prs, content, palette, meta, page_num)
            slide_count += 1

        elif slide_type == "sources":
            page_num += 1
            build_sources_slide(prs, content, palette, meta, page_num)
            slide_count += 1

        elif slide_type == "back_cover":
            build_back_cover(prs, content, palette)
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
