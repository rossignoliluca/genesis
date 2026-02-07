"""
Genesis Presentation Engine — Design System

Parameterized color palettes, matplotlib configuration, and layout constants.
All design choices are data-driven: no hardcoded values in chart/template code.
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


# Pre-built palettes
PALETTES: Dict[str, ColorPalette] = {
    # Real Crossinvest SA branding from crossinvest.ch
    "crossinvest_navy_gold": ColorPalette(
        navy="#24618e",
        gold="#B8860B",
        chart_primary="#24618e",
        chart_secondary="#3566bb",
        chart_bg="#FAFBFC",
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
    """Configure matplotlib rcParams for presentation-quality charts."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    if palette is None:
        palette = get_palette()

    is_dark = palette.fig_bg not in ("#FFFFFF", "#FAFBFC")
    grid_color = "#1E2D42" if is_dark else "#CCCCCC"
    grid_alpha = 0.5 if is_dark else 0.3

    plt.rcParams.update({
        "font.family": "Arial",
        "font.size": 10,
        "axes.facecolor": palette.chart_bg,
        "figure.facecolor": palette.fig_bg,
        "axes.edgecolor": palette.gray,
        "axes.linewidth": 0.8,
        "axes.grid": True,
        "grid.color": grid_color,
        "grid.linestyle": "--",
        "grid.alpha": grid_alpha,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.color": palette.body_text,
        "ytick.color": palette.body_text,
        "text.color": palette.body_text,
        "figure.dpi": palette and 250 or 250,
        "savefig.dpi": 250,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.15,
    })

    return plt
