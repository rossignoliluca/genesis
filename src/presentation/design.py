"""
Genesis Presentation Engine — Design System

Parameterized color palettes, matplotlib configuration, and layout constants.
All design choices are data-driven: no hardcoded values in chart/template code.

Design references (compiled from 12+ research agents, Feb 2026):
- JPMorgan Guide to the Markets / Salt Design System (blue-800 #002D59)
- Goldman Sachs Research (#00355F navy, Goldman Sans)
- BlackRock BII (Vermilion #FF4713, traffic-light semantic)
- Morgan Stanley FWUXDS (5-shade blue, 20% luminance steps)
- UBS (Red #E60000, UBS Headline serif + Frutiger body)
- Indosuez (#1B3764 navy + #C5A76B gold)
- Swiss private banks: Pictet, Lombard Odier, Julius Baer, Vontobel
- Financial media: Economist, FT, Visual Capitalist, Bloomberg
- Best practices: Tufte, McKinsey, Okabe-Ito colorblind-safe palettes

Institutional rules enforced:
- Horizontal gridlines only (y-axis)
- No top/right spines
- Direct labels over legends where possible
- Max 5-6 series per chart
- Source at bottom-left, 7pt gray italic
- Arial/Helvetica as universal safe font
"""

from dataclasses import dataclass, field
from typing import Dict, Optional
from pptx.dml.color import RGBColor


# ============================================================================
# Color Palette
# ============================================================================

@dataclass
class ColorPalette:
    """Complete color system for a presentation."""
    # Primary branding
    navy: str = "#0C2340"
    gold: str = "#B8860B"
    white: str = "#FFFFFF"

    # Chart colors
    chart_primary: str = "#003366"
    chart_secondary: str = "#117ACA"
    green: str = "#2E865F"
    red: str = "#CC0000"
    orange: str = "#E8792B"

    # Text colors
    body_text: str = "#2C3E50"
    gray: str = "#666666"
    source_color: str = "#999999"
    light_gray: str = "#E0E0E0"

    # Backgrounds
    chart_bg: str = "#FAFBFC"
    fig_bg: str = "#FFFFFF"  # matplotlib figure facecolor (separate from PPTX white)
    slide_bg: str = "#FFFFFF"  # PPTX content slide background

    # Dark-mode-aware semantic colors
    title_color: str = "#0C2340"  # slide title text (navy for light, white for dark)
    card_bg: str = "#F5F5F5"  # glassmorphism card background
    card_border: str = "#E0E0E0"  # card border color

    # Extended palette for multi-series charts
    extra_colors: list = field(default_factory=lambda: [
        "#5B9BD5", "#ED7D31", "#A5A5A5", "#FFC000", "#4472C4", "#70AD47"
    ])

    # Chart series cycle (default: institutional blue-dominant)
    series_cycle: list = field(default_factory=lambda: [
        "#003366", "#117ACA", "#2E865F", "#CC0000",
        "#5B9BD5", "#E8792B", "#666666", "#003B6F"
    ])


# Pre-built palettes
PALETTES: Dict[str, ColorPalette] = {
    # Real Crossinvest SA branding from crossinvest.ch
    "crossinvest_navy_gold": ColorPalette(
        navy="#24618e",
        gold="#B8860B",
        chart_primary="#24618e",
        chart_secondary="#3566bb",
        chart_bg="#FFFFFF",
        green="#2E865F",
        red="#C0392B",
        orange="#D46A28",
        gray="#6C757D",
        source_color="#999999",
        light_gray="#D5D8DC",
        series_cycle=[
            "#24618e", "#D46A28", "#2E865F", "#C0392B",
            "#5B9BD5", "#B8860B", "#6C757D", "#003B6F"
        ],
    ),
    "corporate_blue": ColorPalette(
        navy="#1B365D", gold="#C5A55A", chart_primary="#2C5F8A",
        chart_secondary="#4A90D9", green="#28A745", red="#DC3545",
    ),
    "minimal_bw": ColorPalette(
        navy="#1A1A1A", gold="#888888", chart_primary="#333333",
        chart_secondary="#666666", green="#2D6A2D", red="#8B0000",
        chart_bg="#FFFFFF",
    ),
    # Premium dark mode — 2026 social media / institutional style
    # Deep navy chart backgrounds, bright saturated accents, high contrast
    # PPTX slides keep navy/gold theme; charts get dark bg via fig_bg/chart_bg
    "crossinvest_dark": ColorPalette(
        navy="#0D2137",
        gold="#F0B90B",
        white="#FFFFFF",
        chart_primary="#00D4FF",
        chart_secondary="#7B61FF",
        green="#00E676",
        red="#FF5252",
        orange="#FFB74D",
        body_text="#E8EDF3",
        gray="#8899AA",
        source_color="#5A7B8D",
        light_gray="#1E2D42",
        chart_bg="#0F1B2D",
        fig_bg="#0A1628",
        slide_bg="#0D1B2A",
        title_color="#FFFFFF",
        card_bg="#152238",
        card_border="#1E3454",
        extra_colors=["#FF6EC7", "#00BFA5", "#FFCA28", "#448AFF", "#FF7043", "#CE93D8"],
        series_cycle=[
            "#00D4FF", "#FF5252", "#00E676", "#7B61FF",
            "#FFB74D", "#00BFA5", "#FF6EC7", "#448AFF"
        ],
    ),

    # ============================================================
    # Institutional Reference Palettes (from 12+ research agents)
    # ============================================================

    # JPMorgan Guide to the Markets — the gold standard
    # Source: Salt Design System tokens (github.com/jpmorganchase/salt-ds)
    "jpm_gttm": ColorPalette(
        navy="#004B87",
        gold="#E8941A",
        chart_primary="#002D59",  # blue-800
        chart_secondary="#0078CF",  # blue-500
        green="#00875D",  # green-500
        red="#E52135",  # red-500
        orange="#C75300",  # orange-500
        body_text="#3A3F44",  # gray-800
        gray="#72777D",  # gray-500
        source_color="#72777D",
        light_gray="#D3D5D8",  # gray-200
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#004B87",
        card_bg="#F5F7F8",  # marble
        card_border="#D3D5D8",
        extra_colors=["#1B7F9E", "#9ABDF5", "#A25BAD", "#C7DEFF"],
        series_cycle=[
            "#002D59", "#0078CF", "#1B7F9E", "#72777D",
            "#9ABDF5", "#00875D", "#C75300", "#A25BAD"
        ],
    ),

    # Goldman Sachs Research style
    "goldman_sachs": ColorPalette(
        navy="#00355F",
        gold="#7399C6",
        chart_primary="#00355F",
        chart_secondary="#7399C6",
        green="#2E8540",
        red="#C5283D",
        orange="#E69F00",
        body_text="#231F20",
        gray="#58575A",
        source_color="#58575A",
        light_gray="#E0E0E0",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#00355F",
        card_bg="#F5F5F5",
        card_border="#D0D0D0",
        extra_colors=["#ACD4F1", "#64A8F0", "#2178C4", "#7F90AC"],
        series_cycle=[
            "#00355F", "#7399C6", "#ACD4F1", "#64A8F0",
            "#2178C4", "#7F90AC", "#231F20", "#58575A"
        ],
    ),

    # Indosuez Wealth Management — Swiss private banking heritage
    "indosuez": ColorPalette(
        navy="#1B3764",
        gold="#C5A76B",
        chart_primary="#1B3764",
        chart_secondary="#4A7FB5",
        green="#2E865F",
        red="#722F37",
        orange="#D4AF37",
        body_text="#333333",
        gray="#6B6B6B",
        source_color="#999999",
        light_gray="#E8E4DF",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#1B3764",
        card_bg="#F5F3F0",
        card_border="#E8E4DF",
        extra_colors=["#0F2340", "#722F37", "#8C8C8C", "#D4AF37"],
        series_cycle=[
            "#1B3764", "#C5A76B", "#4A7FB5", "#722F37",
            "#0F2340", "#8C8C8C", "#D4AF37", "#333333"
        ],
    ),

    # BlackRock BII — minimal, data-authority style
    "blackrock_bii": ColorPalette(
        navy="#000000",
        gold="#FFCE00",
        chart_primary="#000000",
        chart_secondary="#FF4713",
        green="#00B050",
        red="#FF4713",
        orange="#FFC000",
        body_text="#333333",
        gray="#808080",
        source_color="#808080",
        light_gray="#E5E5E5",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#000000",
        card_bg="#F4F1EB",
        card_border="#E5E5E5",
        extra_colors=["#009688", "#F4F1EB", "#666666", "#FFCE00"],
        series_cycle=[
            "#000000", "#FF4713", "#00B050", "#FFC000",
            "#009688", "#808080", "#666666", "#333333"
        ],
    ),

    # ============================================================
    # Colorblind-Safe Palettes (Okabe-Ito, ColorBrewer)
    # ============================================================

    # Okabe-Ito universal colorblind-safe palette (8 categorical colors)
    # Reference: Okabe & Ito (2008), universally distinguishable for all
    # forms of color vision deficiency. Ideal for: bar, line, scatter, return_quilt.
    "okabe_ito": ColorPalette(
        navy="#000000",
        gold="#E69F00",
        white="#FFFFFF",
        chart_primary="#0072B2",
        chart_secondary="#56B4E9",
        green="#009E73",
        red="#D55E00",
        orange="#E69F00",
        body_text="#1A1A2E",
        gray="#666666",
        source_color="#999999",
        light_gray="#E0E0E0",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#1A1A2E",
        card_bg="#F5F5F5",
        card_border="#E0E0E0",
        extra_colors=["#F0E442", "#CC79A7", "#000000", "#56B4E9"],
        series_cycle=[
            "#E69F00", "#56B4E9", "#009E73", "#F0E442",
            "#0072B2", "#D55E00", "#CC79A7", "#000000"
        ],
    ),

    # Blue-Orange diverging palette (ColorBrewer RdBu inspired)
    # Blue (#2166AC) → White (#F7F7F7) → Red (#B2182B)
    # Ideal for: heatmap, table_heatmap, return_quilt, gauge
    "blue_orange_diverging": ColorPalette(
        navy="#2166AC",
        gold="#F4A582",
        white="#FFFFFF",
        chart_primary="#2166AC",
        chart_secondary="#4393C3",
        green="#4DAF4A",
        red="#B2182B",
        orange="#E66101",
        body_text="#1A1A2E",
        gray="#666666",
        source_color="#999999",
        light_gray="#E0E0E0",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#1A1A2E",
        card_bg="#F7F7F7",
        card_border="#D1D1D1",
        extra_colors=["#92C5DE", "#D6604D", "#F4A582", "#FDDBC7"],
        series_cycle=[
            "#2166AC", "#4393C3", "#92C5DE", "#F7F7F7",
            "#FDDBC7", "#F4A582", "#D6604D", "#B2182B"
        ],
    ),

    # Swiss Institutional Elegance — light cream/gray background
    # Inspired by: Julius Baer Royal Blue, Pictet understated luxury,
    # Lombard Odier warm neutrals, Valerie Noel (BlackRock) clean institutional
    # Color psychology: Navy = trust/authority, warm gray = sophistication,
    # muted green/red = financial semantics without alarm
    # Light background (#F5F5F5) preferred over dark for Swiss private banking
    "swiss_institutional": ColorPalette(
        navy="#003366",
        gold="#8d6e63",
        white="#FFFFFF",
        chart_primary="#003366",
        chart_secondary="#4A90D9",
        green="#2E865F",
        red="#C0392B",
        orange="#D4A056",
        body_text="#2C3E50",
        gray="#6B7B8D",
        source_color="#8899AA",
        light_gray="#D5D8DC",
        chart_bg="#FAFBFC",
        fig_bg="#FFFFFF",
        slide_bg="#F5F5F5",
        title_color="#003366",
        card_bg="#FFFFFF",
        card_border="#D5D8DC",
        extra_colors=["#5B9BD5", "#8d6e63", "#A5C882", "#D4A056", "#7986CB", "#90A4AE"],
        series_cycle=[
            "#003366", "#4A90D9", "#2E865F", "#C0392B",
            "#8d6e63", "#5B9BD5", "#D4A056", "#7986CB"
        ],
    ),

    # Rossignoli Editorial — SYZ-inspired clean white editorial layout
    # White backgrounds, orange #E8792B as primary accent (editorial DNA)
    # Charcoal text for warmer editorial tone, no navy headers
    # title_color = "#E8792B" signals editorial mode to templates.py
    "rossignoli_editorial": ColorPalette(
        navy="#2C3E50",
        gold="#E8792B",
        white="#FFFFFF",
        chart_primary="#2C3E50",
        chart_secondary="#4A90D9",
        green="#27AE60",
        red="#C0392B",
        orange="#E8792B",
        body_text="#2C3E50",
        gray="#6B7B8D",
        source_color="#8899AA",
        light_gray="#D5D8DC",
        chart_bg="#FAFBFC",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#E8792B",
        card_bg="#FFFFFF",
        card_border="#E0E0E0",
        extra_colors=["#5B9BD5", "#8E44AD", "#D4A056", "#1ABC9C", "#F39C12", "#34495E"],
        series_cycle=[
            "#2C3E50", "#4A90D9", "#27AE60", "#C0392B",
            "#E8792B", "#8E44AD", "#D4A056", "#1ABC9C"
        ],
    ),

    # Morgan Stanley — 5-shade blue system
    "morgan_stanley": ColorPalette(
        navy="#00263A",
        gold="#C48A00",
        chart_primary="#003C71",
        chart_secondary="#1A6BA8",
        green="#2E8540",
        red="#C5283D",
        orange="#C48A00",
        body_text="#333333",
        gray="#6A7B8A",
        source_color="#6A7B8A",
        light_gray="#E5E5E5",
        chart_bg="#FFFFFF",
        fig_bg="#FFFFFF",
        slide_bg="#FFFFFF",
        title_color="#00263A",
        card_bg="#F5F5F5",
        card_border="#E0E0E0",
        extra_colors=["#4D94C8", "#80B8DE", "#D1E4F1", "#BFBFBF"],
        series_cycle=[
            "#003C71", "#1A6BA8", "#4D94C8", "#80B8DE",
            "#D1E4F1", "#6A7B8A", "#C5283D", "#C48A00"
        ],
    ),
}


def rgb(hex_str: str) -> RGBColor:
    """Convert hex string to pptx RGBColor."""
    h = hex_str.lstrip("#")
    return RGBColor(int(h[:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def get_palette(name: str = "crossinvest_navy_gold") -> ColorPalette:
    """Get a named palette or return default."""
    return PALETTES.get(name, PALETTES["crossinvest_navy_gold"])


def is_dark(palette: ColorPalette) -> bool:
    """Check if palette is dark mode."""
    return palette.fig_bg not in ("#FFFFFF", "#FAFBFC")


def is_editorial(palette: ColorPalette) -> bool:
    """Check if palette is in editorial mode (orange title = editorial DNA)."""
    return palette.title_color == "#E8792B"


# ============================================================================
# Section Badge Colors (SYZ-style colored category badges)
# ============================================================================

SECTION_BADGE_COLORS: Dict[str, str] = {
    "equities": "#27AE60",
    "fixed_income": "#8E44AD",
    "fx": "#2980B9",
    "commodities": "#D4A056",
    "macro": "#E74C3C",
    "crypto": "#F39C12",
    "geopolitics": "#1ABC9C",
    "central_banks": "#34495E",
}


# ============================================================================
# Editorial Layout (fixed dimensions for SYZ-style slides)
# ============================================================================

@dataclass
class EditorialLayout:
    """Fixed dimensions for the editorial slide layout."""
    # Header
    accent_line_top: float = 0.0
    accent_line_height: float = 0.04  # 3pt orange line — bolder
    header_tag_top: float = 0.12
    header_tag_height: float = 0.35
    header_sep_top: float = 0.5
    # Content area
    badge_top: float = 0.68
    badge_height: float = 0.3
    hashtag_top: float = 1.05
    commentary_top: float = 1.4
    commentary_height: float = 0.75  # tighter — chart is the hero
    chart_top: float = 2.25
    chart_height: float = 4.2  # massive chart area
    source_top: float = 6.55
    # Footer
    footer_sep_top: float = 6.85
    footer_top: float = 6.95
    footer_height: float = 0.4
    # Margins
    margin_left: float = 0.6
    margin_right: float = 0.6
    content_width: float = 12.1


EDITORIAL_LAYOUT = EditorialLayout()


# ============================================================================
# Slide Layout
# ============================================================================

@dataclass
class SlideLayout:
    """Dimensions and spacing for slide elements."""
    # Slide dimensions (inches)
    width: float = 13.333
    height: float = 7.5

    # Margins
    margin_left: float = 0.6
    margin_right: float = 0.6
    margin_top: float = 0.5
    margin_bottom: float = 0.5

    # Header bar
    header_height: float = 0.5

    # Footer
    footer_y: float = 7.0
    footer_height: float = 0.35

    # Title area
    title_top: float = 0.7
    title_height: float = 0.8
    subtitle_top: float = 1.45
    tag_top: float = 1.95

    # Chart area
    chart_top: float = 2.5
    chart_height: float = 4.5
    chart_tag_top: float = 2.15

    # Font sizes (pt)
    title_size: int = 22
    subtitle_size: int = 12
    body_size: int = 11
    source_size: int = 7
    header_size: int = 10
    footer_size: int = 8
    tag_size: int = 11
    chart_tag_size: int = 9

    # Chart rendering
    chart_dpi: int = 250
    chart_figsize_wide: tuple = (14, 5.5)
    chart_figsize_square: tuple = (10, 5)


DEFAULT_LAYOUT = SlideLayout()


# ============================================================================
# Matplotlib Configuration
# ============================================================================

def setup_matplotlib(palette: Optional[ColorPalette] = None):
    """Legacy matplotlib setup — now a no-op since we use Plotly.

    Kept for backward compatibility with engine.py and any code
    that calls setup_matplotlib() before rendering.
    """
    pass


def get_plotly_template(palette: Optional[ColorPalette] = None) -> dict:
    """Get a Plotly layout template dict for institutional-grade charts.

    Encodes the same design rules as the old matplotlib setup:
    - Horizontal gridlines only (y-axis)
    - No top/right borders
    - Arial/Helvetica font
    - Source at bottom-left, 7pt gray italic
    - High contrast for dark mode
    """
    if palette is None:
        palette = get_palette()

    dark = palette.fig_bg not in ("#FFFFFF", "#FAFBFC")

    grid_color = "#1E2D42" if dark else palette.light_gray
    grid_alpha = 0.5 if dark else 0.7
    edge_color = palette.gray if dark else "#CCCCCC"

    return {
        "font": {
            "family": "Arial, Helvetica Neue, Helvetica, sans-serif",
            "size": 10,
            "color": palette.body_text,
        },
        "paper_bgcolor": palette.fig_bg,
        "plot_bgcolor": palette.chart_bg,
        "margin": {"l": 60, "r": 30, "t": 60, "b": 80},
        "xaxis": {
            "showgrid": False,
            "showline": True,
            "linecolor": edge_color,
            "linewidth": 0.6,
            "mirror": False,
            "tickfont": {"size": 8, "color": palette.gray},
            "ticks": "outside",
            "ticklen": 3,
        },
        "yaxis": {
            "showgrid": True,
            "gridcolor": grid_color,
            "gridwidth": 0.4,
            "griddash": "solid",
            "showline": False,
            "zeroline": False,
            "mirror": False,
            "tickfont": {"size": 8, "color": palette.gray},
            "ticks": "",
        },
        "legend": {
            "bgcolor": "rgba(255,255,255,0.85)" if not dark else "rgba(15,27,45,0.85)",
            "bordercolor": palette.card_border,
            "borderwidth": 0.5,
            "font": {"size": 8},
        },
        "colorway": palette.series_cycle,
    }
