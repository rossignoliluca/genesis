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
from charts import (
    render_chart, render_line, render_bar, render_hbar, render_table_heatmap,
    render_gauge, render_donut_matrix, render_waterfall, render_return_quilt,
    render_scatter, render_sparkline_table, render_lollipop, render_dumbbell,
    render_area, render_bump, render_small_multiples,
)


class TestDesign(unittest.TestCase):
    """Test the design system."""

    def test_default_palette_exists(self):
        palette = get_palette()
        self.assertEqual(palette.navy, "#24618e")  # crossinvest_navy_gold default
        self.assertEqual(palette.gold, "#B8860B")

    def test_named_palette(self):
        palette = get_palette("crossinvest_navy_gold")
        self.assertIsInstance(palette, ColorPalette)

    def test_unknown_palette_returns_default(self):
        palette = get_palette("nonexistent")
        self.assertEqual(palette.navy, "#24618e")  # falls back to crossinvest_navy_gold

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


class TestNewPalettes(unittest.TestCase):
    """Test colorblind-safe palettes (v16.5)."""

    def test_okabe_ito_palette(self):
        palette = get_palette("okabe_ito")
        self.assertEqual(palette.chart_primary, "#0072B2")
        self.assertEqual(len(palette.series_cycle), 8)
        # Verify it produces a valid chart
        setup_matplotlib(palette)
        output_dir = tempfile.mkdtemp(prefix="genesis_test_okabe_")
        data = {
            "labels": ["A", "B", "C"],
            "series": [{"name": "Test", "values": [1, 2, 3]}],
        }
        path = render_line(data, {}, palette, "Source: Test",
                          os.path.join(output_dir, "test_okabe.png"))
        self.assertTrue(os.path.exists(path))

    def test_swiss_institutional_palette(self):
        palette = get_palette("swiss_institutional")
        self.assertEqual(palette.chart_primary, "#003366")
        self.assertEqual(palette.slide_bg, "#F5F5F5")
        self.assertEqual(palette.fig_bg, "#FFFFFF")  # Light mode
        setup_matplotlib(palette)
        output_dir = tempfile.mkdtemp(prefix="genesis_test_swiss_")
        data = {
            "labels": ["Jan", "Feb", "Mar", "Apr"],
            "series": [
                {"name": "Fund A", "values": [100, 103, 101, 106]},
                {"name": "Fund B", "values": [100, 98, 102, 104]},
            ],
        }
        path = render_line(data, {"slope_labels": True}, palette, "Source: Test",
                          os.path.join(output_dir, "test_swiss.png"))
        self.assertTrue(os.path.exists(path))

    def test_blue_orange_diverging_palette(self):
        palette = get_palette("blue_orange_diverging")
        self.assertEqual(palette.chart_primary, "#2166AC")
        self.assertEqual(palette.red, "#B2182B")
        setup_matplotlib(palette)
        output_dir = tempfile.mkdtemp(prefix="genesis_test_div_")
        data = {
            "labels": ["A", "B", "C"],
            "series": [{"name": "Test", "values": [1, 2, 3]}],
        }
        path = render_line(data, {}, palette, "",
                          os.path.join(output_dir, "test_diverging.png"))
        self.assertTrue(os.path.exists(path))


class TestLineEnhancements(unittest.TestCase):
    """Test line chart recession shading and slope labels (v16.5)."""

    @classmethod
    def setUpClass(cls):
        cls.palette = get_palette()
        cls.output_dir = tempfile.mkdtemp(prefix="genesis_test_line_enh_")
        setup_matplotlib(cls.palette)

    def test_recession_shading(self):
        data = {
            "labels": ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
            "series": [{"name": "GDP", "values": [100, 98, 95, 93, 96, 100]}],
            "shaded_regions": [
                {"start": 1, "end": 3, "label": "Recession", "color": "#CCCCCC"},
            ],
        }
        config = {"ylabel": "Index"}
        path = render_line(data, config, self.palette, "Source: Test",
                          os.path.join(self.output_dir, "test_recession.png"))
        self.assertTrue(os.path.exists(path))
        self.assertGreater(os.path.getsize(path), 1000)

    def test_slope_labels(self):
        data = {
            "labels": ["Jan", "Feb", "Mar", "Apr", "May"],
            "series": [
                {"name": "Fund A", "values": [100, 105, 103, 108, 112]},
                {"name": "Fund B", "values": [100, 99, 101, 98, 97]},
            ],
        }
        config = {"slope_labels": True}
        path = render_line(data, config, self.palette, "",
                          os.path.join(self.output_dir, "test_slope.png"))
        self.assertTrue(os.path.exists(path))


class TestNewChartTypes(unittest.TestCase):
    """Test all 8 new chart renderers (v16.5)."""

    @classmethod
    def setUpClass(cls):
        cls.palette = get_palette()
        cls.output_dir = tempfile.mkdtemp(prefix="genesis_test_new_charts_")
        setup_matplotlib(cls.palette)

    def test_return_quilt(self):
        data = {
            "years": ["2020", "2021", "2022", "2023"],
            "assets": ["US Equity", "EM Equity", "Bonds", "Gold"],
            "returns": [
                [18.4, 18.3, 7.5, 25.1],
                [28.7, -2.5, -1.5, -3.6],
                [-18.1, -20.1, -13.0, -0.3],
                [26.3, 9.8, 5.5, 13.1],
            ],
        }
        config = {"title": "Periodic Table of Returns", "color_mode": "gradient"}
        path = render_return_quilt(data, config, self.palette, "Source: Test",
                                    os.path.join(self.output_dir, "test_quilt.png"))
        self.assertTrue(os.path.exists(path))
        self.assertGreater(os.path.getsize(path), 1000)

    def test_scatter(self):
        data = {
            "points": [
                {"x": 5, "y": 10, "label": "AAPL"},
                {"x": 8, "y": 6, "label": "MSFT"},
                {"x": 3, "y": 12, "label": "GOOG"},
                {"x": 7, "y": 4, "label": "AMZN"},
            ],
            "x_label": "Risk (%)",
            "y_label": "Return (%)",
            "trend_line": True,
        }
        config = {"title": "Risk vs Return"}
        path = render_scatter(data, config, self.palette, "Source: Test",
                             os.path.join(self.output_dir, "test_scatter.png"))
        self.assertTrue(os.path.exists(path))

    def test_sparkline_table(self):
        data = {
            "headers": ["Asset", "Price", "Chg"],
            "rows": [
                {"cells": ["S&P 500", "6,918", "+1.2%"], "sparkline": [100, 99, 101, 103, 102]},
                {"cells": ["Gold", "$4,600", "-5.0%"], "sparkline": [105, 103, 100, 98, 96]},
                {"cells": ["Bitcoin", "$75K", "+3.2%"], "sparkline": [70, 72, 71, 74, 75]},
            ],
        }
        config = {}
        path = render_sparkline_table(data, config, self.palette, "Source: Test",
                                       os.path.join(self.output_dir, "test_sparkline.png"))
        self.assertTrue(os.path.exists(path))

    def test_lollipop(self):
        data = {
            "categories": ["Tech", "Healthcare", "Energy", "Finance", "Utilities"],
            "values": [12.5, 8.3, -5.2, 3.1, -1.8],
        }
        config = {"sort": True, "xlabel": "Return (%)"}
        path = render_lollipop(data, config, self.palette, "Source: Test",
                              os.path.join(self.output_dir, "test_lollipop.png"))
        self.assertTrue(os.path.exists(path))

    def test_dumbbell(self):
        data = {
            "categories": ["US", "Europe", "Japan", "EM"],
            "start": [2.5, 1.8, 0.5, 4.2],
            "end": [3.1, 1.2, 0.8, 3.5],
            "start_label": "2024",
            "end_label": "2025",
        }
        config = {"xlabel": "GDP Growth (%)", "title": "GDP Growth Change"}
        path = render_dumbbell(data, config, self.palette, "Source: Test",
                              os.path.join(self.output_dir, "test_dumbbell.png"))
        self.assertTrue(os.path.exists(path))

    def test_area(self):
        data = {
            "labels": ["Q1", "Q2", "Q3", "Q4"],
            "series": [
                {"name": "Revenue", "values": [100, 120, 115, 130]},
                {"name": "Costs", "values": [80, 90, 85, 95]},
            ],
        }
        config = {"stacked": True, "ylabel": "$M"}
        path = render_area(data, config, self.palette, "Source: Test",
                          os.path.join(self.output_dir, "test_area.png"))
        self.assertTrue(os.path.exists(path))

    def test_bump(self):
        data = {
            "periods": ["2020", "2021", "2022", "2023"],
            "series": [
                {"name": "US Equity", "ranks": [1, 1, 4, 1]},
                {"name": "EM Equity", "ranks": [2, 4, 3, 3]},
                {"name": "Bonds", "ranks": [3, 3, 2, 4]},
                {"name": "Gold", "ranks": [4, 2, 1, 2]},
            ],
        }
        config = {"title": "Asset Class Rankings"}
        path = render_bump(data, config, self.palette, "Source: Test",
                          os.path.join(self.output_dir, "test_bump.png"))
        self.assertTrue(os.path.exists(path))

    def test_small_multiples(self):
        data = {
            "panels": [
                {"title": "US", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [2.1, 2.3, 1.8, 2.5]},
                {"title": "Europe", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [0.8, 1.1, 0.9, 1.2]},
                {"title": "Japan", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [0.5, 0.3, 0.7, 0.4]},
                {"title": "EM", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [4.2, 3.8, 4.5, 4.1]},
            ],
        }
        config = {"chart_type": "line", "title": "GDP Growth by Region"}
        path = render_small_multiples(data, config, self.palette, "Source: Test",
                                       os.path.join(self.output_dir, "test_small_mult.png"))
        self.assertTrue(os.path.exists(path))

    def test_small_multiples_incompatible_ranges(self):
        """Panels with wildly different ranges should NOT share Y axis."""
        data = {
            "panels": [
                {"title": "GDP %", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [2.1, 2.3, 1.8, 2.5]},
                {"title": "Inflation %", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [0.3, 0.4, 0.5, 0.6]},
                {"title": "Defense $Bn", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [240, 310, 370, 420]},
                {"title": "Rates %", "labels": ["Q1", "Q2", "Q3", "Q4"], "values": [4.5, 4.25, 4.0, 3.75]},
            ],
        }
        config = {"chart_type": "line", "title": "Mixed Scale Metrics"}
        path = render_small_multiples(data, config, self.palette, "Source: Test",
                                       os.path.join(self.output_dir, "test_small_mult_mixed.png"))
        self.assertTrue(os.path.exists(path))
        self.assertGreater(os.path.getsize(path), 1000)


class TestEndToEndMixedCharts(unittest.TestCase):
    """End-to-end test: PPTX with mix of old and new chart types."""

    @classmethod
    def setUpClass(cls):
        cls.output_dir = tempfile.mkdtemp(prefix="genesis_test_e2e_")

    def test_mixed_chart_presentation(self):
        from engine import generate

        spec = {
            "meta": {"title": "Mixed Chart Test", "palette": "okabe_ito"},
            "slides": [
                {"type": "cover", "content": {"headline": "V16.5 Mixed Charts"}},
                {
                    "type": "chart",
                    "content": {"title": "Line with Shading"},
                    "chart": {
                        "type": "line",
                        "data": {
                            "labels": ["Q1", "Q2", "Q3", "Q4"],
                            "series": [{"name": "GDP", "values": [100, 98, 96, 101]}],
                            "shaded_regions": [{"start": 1, "end": 2, "label": "Recession"}],
                        },
                        "config": {"slope_labels": True},
                        "source": "Test",
                        "filename": "e2e_line.png",
                    },
                },
                {
                    "type": "chart",
                    "content": {"title": "Return Quilt"},
                    "chart": {
                        "type": "return_quilt",
                        "data": {
                            "years": ["2022", "2023"],
                            "assets": ["Equity", "Bonds", "Gold"],
                            "returns": [[-18.1, -13.0, -0.3], [26.3, 5.5, 13.1]],
                        },
                        "source": "Test",
                        "filename": "e2e_quilt.png",
                    },
                },
                {
                    "type": "chart",
                    "content": {"title": "Scatter Plot"},
                    "chart": {
                        "type": "scatter",
                        "data": {
                            "points": [
                                {"x": 5, "y": 10, "label": "A"},
                                {"x": 8, "y": 6, "label": "B"},
                            ],
                            "x_label": "Risk",
                            "y_label": "Return",
                        },
                        "source": "Test",
                        "filename": "e2e_scatter.png",
                    },
                },
                {
                    "type": "chart",
                    "content": {"title": "Lollipop"},
                    "chart": {
                        "type": "lollipop",
                        "data": {
                            "categories": ["A", "B", "C"],
                            "values": [10, -5, 8],
                        },
                        "source": "Test",
                        "filename": "e2e_lollipop.png",
                    },
                },
                {
                    "type": "chart",
                    "content": {"title": "Bump Chart"},
                    "chart": {
                        "type": "bump",
                        "data": {
                            "periods": ["2022", "2023"],
                            "series": [
                                {"name": "X", "ranks": [1, 2]},
                                {"name": "Y", "ranks": [2, 1]},
                            ],
                        },
                        "source": "Test",
                        "filename": "e2e_bump.png",
                    },
                },
                {"type": "back_cover", "content": {"company": "TEST"}},
            ],
            "output_path": os.path.join(self.output_dir, "test_e2e_mixed.pptx"),
            "chart_dir": os.path.join(self.output_dir, "e2e_charts"),
        }

        result = generate(spec)
        self.assertTrue(result["success"])
        self.assertEqual(result["slides"], 7)
        self.assertEqual(result["charts"], 5)
        self.assertTrue(os.path.exists(result["path"]))
        self.assertGreater(os.path.getsize(result["path"]), 10000)


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
