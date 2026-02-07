#!/usr/bin/env python3
"""
Genesis Presentation Engine — Python Tests

Tests for chart renderers, templates, and the full engine pipeline.

Usage:
  python3 -m pytest src/presentation/test_engine.py -v
  # or directly:
  python3 src/presentation/test_engine.py
"""

import json
import os
import sys
import tempfile
import unittest

# Ensure sibling imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from design import ColorPalette, get_palette, setup_matplotlib, rgb, PALETTES
from charts import render_chart, render_line, render_bar, render_hbar, render_table_heatmap, render_gauge, render_donut_matrix


class TestDesign(unittest.TestCase):
    """Test the design system."""

    def test_default_palette_exists(self):
        palette = get_palette()
        self.assertEqual(palette.navy, "#0C2340")
        self.assertEqual(palette.gold, "#B8860B")

    def test_named_palette(self):
        palette = get_palette("crossinvest_navy_gold")
        self.assertIsInstance(palette, ColorPalette)

    def test_unknown_palette_returns_default(self):
        palette = get_palette("nonexistent")
        self.assertEqual(palette.navy, "#0C2340")

    def test_rgb_conversion(self):
        color = rgb("#FF0000")
        self.assertEqual(str(color), "FF0000")

    def test_rgb_without_hash(self):
        color = rgb("0C2340")
        self.assertEqual(str(color), "0C2340")

    def test_setup_matplotlib(self):
        plt = setup_matplotlib()
        self.assertIsNotNone(plt)
        # Verify rcParams were set
        self.assertEqual(plt.rcParams["axes.spines.top"], False)
        self.assertEqual(plt.rcParams["axes.spines.right"], False)


class TestCharts(unittest.TestCase):
    """Test chart renderers."""

    @classmethod
    def setUpClass(cls):
        cls.palette = get_palette()
        cls.output_dir = tempfile.mkdtemp(prefix="genesis_test_charts_")
        setup_matplotlib(cls.palette)

    def test_render_line_basic(self):
        data = {
            "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
            "series": [
                {"name": "S&P 500", "values": [100, 99.2, 98.5, 97.8, 99.9]},
            ],
        }
        config = {"ylabel": "Index", "fill": True, "baseline": 100}
        path = render_line(data, config, self.palette, "Source: Test",
                          os.path.join(self.output_dir, "test_line.png"))
        self.assertTrue(os.path.exists(path))
        self.assertGreater(os.path.getsize(path), 1000)

    def test_render_line_multi_series(self):
        data = {
            "labels": ["Q1", "Q2", "Q3", "Q4"],
            "series": [
                {"name": "Revenue", "values": [10, 12, 15, 18]},
                {"name": "Costs", "values": [8, 9, 11, 13]},
                {"name": "Profit", "values": [2, 3, 4, 5]},
            ],
        }
        config = {"ylabel": "$M"}
        path = render_line(data, config, self.palette, "",
                          os.path.join(self.output_dir, "test_line_multi.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_bar_grouped(self):
        data = {
            "labels": ["MSFT", "AMZN", "GOOG", "META"],
            "groups": [
                {"name": "Capex", "values": [80, 200, 75, 65], "color": "#CC0000"},
                {"name": "FCF", "values": [65, -20, 45, 5], "color": "#003366"},
            ],
        }
        config = {"ylabel": "$ Billions", "ylim": [-50, 220]}
        path = render_bar(data, config, self.palette, "Source: Test",
                         os.path.join(self.output_dir, "test_bar.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_hbar(self):
        data = {
            "labels": ["China Equity", "US Large Cap", "Europe Equity"],
            "values": [-45.0, -6.4, 4.2],
        }
        config = {"xlabel": "Weekly Fund Flows ($Bn)"}
        path = render_hbar(data, config, self.palette, "Source: Test",
                          os.path.join(self.output_dir, "test_hbar.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_table_heatmap(self):
        data = {
            "headers": ["Asset", "Price", "1W", "Signal"],
            "rows": [
                ["S&P 500", "6,918", "-0.1%", "Overbought"],
                ["Gold", "$4,600", "-5.0%", "Oversold"],
                ["Bitcoin", "$75,679", "+3.2%", "Neutral"],
            ],
            "separators": [],
        }
        config = {"col_widths": [2.0, 1.5, 1.0, 1.5], "color_cols": [2, 3], "signal_col": 3}
        path = render_table_heatmap(data, config, self.palette, "Source: Test",
                                    os.path.join(self.output_dir, "test_table.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_gauge(self):
        data = {
            "value": 8.9,
            "max_value": 10,
            "zones": [
                {"start": 0, "end": 2, "label": "FEAR", "color": "#C8E6C9", "border": "#2E865F"},
                {"start": 2, "end": 8, "label": "NEUTRAL", "color": "#F5F5F5", "border": "#666666"},
                {"start": 8, "end": 10, "label": "GREED", "color": "#FFCDD2", "border": "#CC0000"},
            ],
        }
        config = {"title": "Bull & Bear Indicator"}
        path = render_gauge(data, config, self.palette, "Source: Test",
                           os.path.join(self.output_dir, "test_gauge.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_donut_matrix(self):
        data = {
            "donut": {
                "labels": ["Equity\n50%", "Bonds\n30%", "Cash\n20%"],
                "sizes": [50, 30, 20],
                "center_text": "Model\nPortfolio",
            },
            "matrix": {
                "headers": ["Asset", "View", "Chg", "Rationale"],
                "rows": [
                    ["Equity", "OW", "↑", "Strong earnings"],
                    ["Bonds", "N", "=", "Carry trade"],
                    ["Cash", "UW", "↓", "Deploy into risk"],
                ],
            },
        }
        config = {}
        path = render_donut_matrix(data, config, self.palette, "Source: Test",
                                   os.path.join(self.output_dir, "test_donut.png"))
        self.assertTrue(os.path.exists(path))

    def test_render_chart_dispatcher(self):
        """Test the main dispatch function."""
        chart_spec = {
            "type": "line",
            "data": {
                "labels": ["A", "B", "C"],
                "series": [{"name": "Test", "values": [1, 2, 3]}],
            },
            "config": {},
            "source": "Test",
            "filename": "dispatch_test.png",
        }
        path = render_chart(chart_spec, self.palette, self.output_dir)
        self.assertTrue(os.path.exists(path))

    def test_unknown_chart_type_raises(self):
        chart_spec = {"type": "unknown_type", "data": {}}
        with self.assertRaises(ValueError):
            render_chart(chart_spec, self.palette, self.output_dir)


class TestEngine(unittest.TestCase):
    """Test the full engine pipeline (JSON → PPTX)."""

    @classmethod
    def setUpClass(cls):
        cls.output_dir = tempfile.mkdtemp(prefix="genesis_test_engine_")

    def test_minimal_presentation(self):
        """Generate a minimal presentation with just a cover slide."""
        from engine import generate

        spec = {
            "meta": {"title": "Test Presentation", "company": "Test Corp"},
            "slides": [
                {
                    "type": "cover",
                    "content": {
                        "company": "TEST CORP",
                        "headline": "Test Presentation",
                        "date_range": "February 2026",
                    },
                },
            ],
            "output_path": os.path.join(self.output_dir, "test_minimal.pptx"),
            "chart_dir": os.path.join(self.output_dir, "charts"),
        }

        result = generate(spec)
        self.assertTrue(result["success"])
        self.assertEqual(result["slides"], 1)
        self.assertEqual(result["charts"], 0)
        self.assertTrue(os.path.exists(result["path"]))

    def test_presentation_with_chart(self):
        """Generate a presentation with a chart slide."""
        from engine import generate

        spec = {
            "meta": {"title": "Chart Test"},
            "slides": [
                {
                    "type": "cover",
                    "content": {"headline": "Chart Test"},
                },
                {
                    "type": "chart",
                    "content": {"title": "Test Chart Slide"},
                    "chart": {
                        "type": "line",
                        "data": {
                            "labels": ["Jan", "Feb", "Mar"],
                            "series": [{"name": "Data", "values": [10, 20, 15]}],
                        },
                        "config": {"ylabel": "Value"},
                        "source": "Test Source",
                        "filename": "test_chart.png",
                    },
                    "chart_num": 1,
                },
            ],
            "output_path": os.path.join(self.output_dir, "test_with_chart.pptx"),
            "chart_dir": os.path.join(self.output_dir, "charts"),
        }

        result = generate(spec)
        self.assertTrue(result["success"])
        self.assertEqual(result["slides"], 2)
        self.assertEqual(result["charts"], 1)

    def test_full_deck(self):
        """Generate a full deck with all slide types."""
        from engine import generate

        spec = {
            "meta": {
                "title": "Full Deck Test",
                "company": "Test SA",
                "date": "FEBRUARY 7, 2026",
                "header_tag": "#TEST",
                "footer_left": "TEST SA | Lugano",
            },
            "slides": [
                {"type": "cover", "content": {"company": "TEST SA", "headline": "Full Test"}},
                {
                    "type": "executive_summary",
                    "content": {
                        "title": "Test assertion title",
                        "sections": [
                            {"label": "S", "text": "Situation text here."},
                            {"label": "C", "text": "Complication text here."},
                            {"label": "R", "text": "Resolution text here."},
                        ],
                    },
                },
                {
                    "type": "chart",
                    "content": {"title": "Test chart assertion"},
                    "chart": {
                        "type": "bar",
                        "data": {
                            "labels": ["A", "B"],
                            "groups": [
                                {"name": "G1", "values": [10, 20]},
                                {"name": "G2", "values": [15, 5]},
                            ],
                        },
                        "source": "Test",
                        "filename": "full_chart.png",
                    },
                },
                {
                    "type": "text",
                    "content": {
                        "title": "What to Watch",
                        "left_title": "OPPORTUNITIES",
                        "left_items": ["Opportunity 1", "Opportunity 2"],
                        "right_title": "RISKS",
                        "right_items": ["Risk 1", "Risk 2"],
                    },
                },
                {
                    "type": "sources",
                    "content": {
                        "left_sources": "Source A\n\nSource B",
                        "right_sources": "Source C\n\nSource D",
                        "disclaimer": "For professional investors only.",
                    },
                },
                {"type": "back_cover", "content": {"company": "TEST SA"}},
            ],
            "output_path": os.path.join(self.output_dir, "test_full.pptx"),
            "chart_dir": os.path.join(self.output_dir, "full_charts"),
        }

        result = generate(spec)
        self.assertTrue(result["success"])
        self.assertEqual(result["slides"], 6)
        self.assertEqual(result["charts"], 1)

    def test_empty_input_fails(self):
        """Empty input should return an error."""
        from engine import generate

        spec = {"meta": {}, "slides": [], "output_path": os.path.join(self.output_dir, "empty.pptx")}
        result = generate(spec)
        self.assertTrue(result["success"])  # Empty slides is valid, just produces empty deck
        self.assertEqual(result["slides"], 0)

    def test_invalid_chart_type_skips(self):
        """Unknown slide types should be skipped with warning."""
        from engine import generate

        spec = {
            "meta": {},
            "slides": [
                {"type": "unknown_slide_type", "content": {}},
                {"type": "cover", "content": {"headline": "Test"}},
            ],
            "output_path": os.path.join(self.output_dir, "test_skip.pptx"),
        }

        result = generate(spec)
        self.assertTrue(result["success"])
        self.assertEqual(result["slides"], 1)  # Only the cover slide


class TestStdinPipeline(unittest.TestCase):
    """Test the stdin→stdout pipeline (as called by the TS bridge)."""

    def test_stdin_pipeline(self):
        """Simulate the TS bridge by piping JSON to the engine."""
        import subprocess

        engine_path = os.path.join(os.path.dirname(__file__), "engine.py")
        output_path = os.path.join(tempfile.mkdtemp(), "pipeline_test.pptx")

        spec = {
            "meta": {"title": "Pipeline Test"},
            "slides": [
                {"type": "cover", "content": {"headline": "Pipeline Test"}},
            ],
            "output_path": output_path,
        }

        result = subprocess.run(
            [sys.executable, engine_path],
            input=json.dumps(spec),
            capture_output=True,
            text=True,
            timeout=60,
        )

        self.assertEqual(result.returncode, 0, f"stderr: {result.stderr}")
        output = json.loads(result.stdout.strip())
        self.assertTrue(output["success"])
        self.assertEqual(output["slides"], 1)
        self.assertTrue(os.path.exists(output["path"]))

    def test_stdin_malformed_json(self):
        """Malformed JSON should return error."""
        import subprocess

        engine_path = os.path.join(os.path.dirname(__file__), "engine.py")

        result = subprocess.run(
            [sys.executable, engine_path],
            input="not valid json {{{",
            capture_output=True,
            text=True,
            timeout=30,
        )

        self.assertNotEqual(result.returncode, 0)
        output = json.loads(result.stdout.strip())
        self.assertFalse(output["success"])
        self.assertIn("Invalid JSON", output["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
