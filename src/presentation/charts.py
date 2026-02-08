"""
Genesis Presentation Engine — Chart Factory

Parameterized chart renderers. Every function receives data from JSON spec,
ZERO hardcoded data. Each renderer returns the path to the saved PNG.
"""

import os
import numpy as np
from matplotlib.patches import FancyBboxPatch


def _is_dark(palette) -> bool:
    """Check if palette is dark mode."""
    return palette.fig_bg not in ("#FFFFFF", "#FAFBFC")


def render_chart(chart_spec: dict, palette, output_dir: str) -> str:
    """
    Dispatch to the appropriate chart renderer.

    chart_spec keys:
      - type: "line" | "bar" | "hbar" | "stacked_bar" | "table_heatmap" | "gauge" | "donut_matrix"
      - data: chart-specific data dict
      - config: chart-specific configuration
      - source: str — source attribution text
      - filename: str — output filename (without dir)
    """
    chart_type = chart_spec["type"]
    data = chart_spec.get("data", {})
    config = chart_spec.get("config", {})
    source = chart_spec.get("source", "")
    filename = chart_spec.get("filename", f"chart_{chart_type}.png")
    output_path = os.path.join(output_dir, filename)

    renderers = {
        "line": render_line,
        "bar": render_bar,
        "hbar": render_hbar,
        "stacked_bar": render_stacked_bar,
        "table_heatmap": render_table_heatmap,
        "gauge": render_gauge,
        "donut_matrix": render_donut_matrix,
        "waterfall": render_waterfall,
        "return_quilt": render_return_quilt,
        "scatter": render_scatter,
        "sparkline_table": render_sparkline_table,
        "lollipop": render_lollipop,
        "dumbbell": render_dumbbell,
        "area": render_area,
        "bump": render_bump,
        "small_multiples": render_small_multiples,
    }

    renderer = renderers.get(chart_type)
    if not renderer:
        raise ValueError(f"Unknown chart type: {chart_type}")

    return renderer(data, config, palette, source, output_path)


def _get_plt():
    """Get matplotlib.pyplot (assumes setup_matplotlib already called)."""
    import matplotlib.pyplot as plt
    return plt


def add_source_text(ax, text: str, palette=None):
    """Add source attribution at bottom of matplotlib chart."""
    color = palette.source_color if palette else "#999999"
    ax.annotate(
        text,
        xy=(0, 0), xycoords="figure fraction",
        xytext=(0.02, 0.01), fontsize=7,
        color=color, fontstyle="italic",
        va="bottom", ha="left",
    )


# ============================================================================
# Line Chart
# ============================================================================

def render_line(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Line chart for time series / trends.

    data:
      labels: ["Mon", "Tue", ...]
      series: [
        {"name": "S&P 500", "values": [100, 99.2, ...], "color": "#003366"},
        ...
      ]
    config:
      ylabel: str
      ylim: [min, max] (optional)
      baseline: float (optional, horizontal reference line)
      annotations: [{xy: [x, y], text: str, color: str}, ...]
      fill: bool (default false)
      figsize: [w, h] (optional)
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    x = range(len(labels))

    markers = ["o", "s", "^", "D", "v", "p", "*"]

    dark = _is_dark(palette)

    for i, series in enumerate(data["series"]):
        color = series.get("color", palette.chart_primary if i == 0 else palette.chart_secondary)
        marker = markers[i % len(markers)]
        line_style = series.get("linestyle", "-")
        lw = series.get("linewidth", 2.5)
        label = series.get("name", f"Series {i+1}")

        # Glow effect on dark backgrounds: wide semi-transparent line behind
        if dark:
            ax.plot(x, series["values"], color=color, linewidth=lw * 3.5,
                    alpha=0.12, zorder=3 - i, linestyle=line_style)

        ax.plot(x, series["values"], color=color, linewidth=lw, marker=marker,
                markersize=6, label=label, zorder=5 - i, linestyle=line_style)

        fill_alpha = 0.15 if dark else 0.08
        if config.get("fill", False) or dark:
            baseline = config.get("baseline", min(v for s in data["series"] for v in s["values"]) if dark else 0)
            ax.fill_between(x, series["values"], baseline, alpha=fill_alpha, color=color)

    # Recession / shaded regions (Bilello-style)
    for region in data.get("shaded_regions", []):
        r_start = region["start"]
        r_end = region["end"]
        r_color = region.get("color", "#CCCCCC" if not dark else "#1E2D42")
        ax.axvspan(r_start, r_end, alpha=0.15, color=r_color, zorder=0)
        if region.get("label"):
            mid_x = (r_start + r_end) / 2
            mid_y = ax.get_ylim()[0] + (ax.get_ylim()[1] - ax.get_ylim()[0]) * 0.5
            ax.text(mid_x, mid_y, region["label"], fontsize=7, rotation=90,
                    ha="center", va="center", color=palette.gray, alpha=0.7)

    # Slope labels (Bilello-style: "Series Name +X.X%" at right of last point)
    if config.get("slope_labels", False) and len(labels) >= 2:
        for i, series in enumerate(data["series"]):
            vals = series["values"]
            if len(vals) >= 2:
                first_val, last_val = vals[0], vals[-1]
                if first_val != 0:
                    pct_change = ((last_val - first_val) / abs(first_val)) * 100
                    sign = "+" if pct_change >= 0 else ""
                    label_text = f"{series.get('name', '')} {sign}{pct_change:.1f}%"
                    color = series.get("color", palette.chart_primary if i == 0 else palette.chart_secondary)
                    ax.annotate(label_text, xy=(len(labels) - 1, last_val),
                                xytext=(8, 0), textcoords="offset points",
                                fontsize=8, color=color, va="center", fontweight="bold")

    # Advanced data-level annotations
    for ann in data.get("annotations", []):
        ann_x = ann.get("x", 0)
        ann_y = ann.get("y", 0)
        ann_text = ann.get("text", "")
        ann_arrow = ann.get("arrow", False)
        arrowprops = dict(arrowstyle="->", color=palette.navy, lw=1.2) if ann_arrow else None
        ann_bbox = dict(boxstyle="round,pad=0.3", facecolor="#E3F2FD" if not dark else "#152238",
                        edgecolor=palette.gray, alpha=0.85)
        ax.annotate(ann_text, xy=(ann_x, ann_y), xytext=(15, 15), textcoords="offset points",
                    fontsize=7, color=palette.body_text, arrowprops=arrowprops, bbox=ann_bbox)

    if "baseline" in config:
        bl_color = "#2A3A4A" if dark else "#CCCCCC"
        ax.axhline(y=config["baseline"], color=bl_color, linestyle="--", linewidth=0.8)

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=9, rotation=config.get("x_rotation", 0),
                       ha="right" if config.get("x_rotation", 0) > 0 else "center")

    if config.get("ylabel"):
        ax.set_ylabel(config["ylabel"], fontsize=11, fontweight="bold")
    if config.get("ylim"):
        ax.set_ylim(config["ylim"])
    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    # Vertical event lines
    for vline in config.get("vlines", []):
        ax.axvline(x=vline["x"], color=vline.get("color", palette.navy),
                   linestyle=vline.get("style", "--"), linewidth=1.5, alpha=0.6)
        if vline.get("label"):
            ax.text(vline["x"] + 0.15, ax.get_ylim()[1] * 0.95, vline["label"],
                    fontsize=8, fontweight="bold", color=vline.get("color", palette.navy), va="top")

    # Horizontal reference lines
    for hline in config.get("hlines", []):
        ax.axhline(y=hline["y"], color=hline.get("color", palette.red),
                   linestyle=hline.get("style", "--"), linewidth=1.2, alpha=0.5)
        if hline.get("label"):
            ax.text(0.5, hline["y"] + (ax.get_ylim()[1] - ax.get_ylim()[0]) * 0.01,
                    hline["label"], fontsize=8, color=hline.get("color", palette.red),
                    fontweight="bold")

    # Annotations
    for ann in config.get("annotations", []):
        props = {}
        if ann.get("arrow", True):
            props = dict(arrowstyle="->", color=ann.get("color", palette.navy), lw=1.5)
        bbox_props = None
        if ann.get("box", False):
            bbox_props = dict(
                boxstyle="round,pad=0.4",
                facecolor=ann.get("box_bg", "#E3F2FD"),
                edgecolor=ann.get("color", palette.navy),
                alpha=0.9,
            )
        ax.annotate(
            ann["text"],
            xy=ann["xy"], xytext=ann.get("xytext", ann["xy"]),
            fontsize=ann.get("fontsize", 9),
            fontweight=ann.get("fontweight", "bold"),
            color=ann.get("color", palette.navy),
            arrowprops=props if ann.get("arrow", True) else None,
            bbox=bbox_props,
        )

    if len(data["series"]) > 1:
        legend_bg = palette.chart_bg if dark else "white"
        legend_text = palette.body_text if dark else "black"
        leg = ax.legend(loc=config.get("legend_loc", "upper left"), fontsize=10,
                        framealpha=0.85, facecolor=legend_bg, edgecolor=palette.card_border if dark else "#CCCCCC")
        if dark:
            for text in leg.get_texts():
                text.set_color(legend_text)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Bar Chart (vertical)
# ============================================================================

def render_bar(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Vertical bar chart for comparisons.

    data:
      labels: ["Microsoft", "Amazon", ...]
      groups: [
        {"name": "Capex", "values": [80, 200, ...], "color": "#CC0000"},
        {"name": "FCF", "values": [65, -20, ...], "color": "#003366"},
      ]
    config:
      ylabel, ylim, annotations, show_values (bool), stacked (bool)
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    groups = data.get("groups", [])
    n_groups = len(groups)
    x = np.arange(len(labels))

    if n_groups == 0:
        # Single series shorthand
        values = data.get("values", [])
        colors = []
        for v in values:
            colors.append(palette.green if v >= 0 else palette.red)
        bars = ax.bar(x, values, 0.6, color=colors, edgecolor="white", linewidth=0.5, zorder=3)
        if config.get("show_values", True):
            for bar, val in zip(bars, values):
                y_pos = bar.get_height() + (max(values) - min(values)) * 0.02
                ax.text(bar.get_x() + bar.get_width() / 2, y_pos,
                        f"${val}B" if config.get("value_prefix") == "$" else f"{val}",
                        ha="center", va="bottom", fontsize=10, fontweight="bold")
    else:
        width = 0.8 / n_groups
        for i, group in enumerate(groups):
            offset = (i - n_groups / 2 + 0.5) * width
            color = group.get("color", palette.chart_primary if i == 0 else palette.chart_secondary)
            bars = ax.bar(x + offset, group["values"], width, label=group["name"],
                         color=color, alpha=0.85, edgecolor="white", linewidth=0.5, zorder=3)
            if config.get("show_values", True):
                for bar, val in zip(bars, group["values"]):
                    y_pos = bar.get_height() + 3 if val >= 0 else bar.get_height() - 8
                    color_txt = palette.green if val >= 0 else palette.red
                    ax.text(bar.get_x() + bar.get_width() / 2, y_pos,
                            f"${val}B", ha="center", va="bottom", fontsize=10,
                            fontweight="bold", color=color_txt)

    dark_bar = _is_dark(palette)
    zero_color = palette.body_text if dark_bar else palette.navy
    ax.axhline(y=0, color=zero_color, linewidth=1.2)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=12, fontweight="bold")

    if config.get("ylabel"):
        ax.set_ylabel(config["ylabel"], fontsize=11, fontweight="bold")
    if config.get("ylim"):
        ax.set_ylim(config["ylim"])

    # Horizontal reference lines
    for hline in config.get("hlines", []):
        ax.axhline(y=hline["y"], color=hline.get("color", palette.gold),
                   linestyle=hline.get("style", "--"), linewidth=1.5, alpha=0.7)
        if hline.get("label"):
            ax.text(len(labels) - 0.5, hline["y"] + (ax.get_ylim()[1] - ax.get_ylim()[0]) * 0.02,
                    hline["label"], fontsize=9, color=hline.get("color", palette.gold),
                    fontweight="bold", ha="right")

    if n_groups > 1:
        leg_bg = palette.chart_bg if dark_bar else "white"
        leg = ax.legend(loc=config.get("legend_loc", "upper left"), fontsize=10,
                        framealpha=0.85, facecolor=leg_bg, edgecolor=palette.card_border if dark_bar else "#CCCCCC")
        if dark_bar:
            for text in leg.get_texts():
                text.set_color(palette.body_text)

    # Annotations
    for ann in config.get("annotations", []):
        bbox_props = None
        if ann.get("box", False):
            bbox_props = dict(
                boxstyle="round,pad=0.5",
                facecolor=ann.get("box_bg", "#FFEBEE"),
                edgecolor=ann.get("color", palette.red),
                alpha=0.95,
            )
        ax.annotate(
            ann["text"], xy=ann["xy"], xytext=ann.get("xytext", ann["xy"]),
            fontsize=ann.get("fontsize", 10), fontweight="bold",
            color=ann.get("color", palette.red),
            arrowprops=dict(arrowstyle="->", color=ann.get("color", palette.red), lw=2),
            bbox=bbox_props,
        )

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Horizontal Bar Chart
# ============================================================================

def render_hbar(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Horizontal bar chart for rankings / fund flows.

    data:
      labels: ["China Equity", "US Large Cap", ...]
      values: [-45.0, -6.4, ...]
    config:
      xlabel, color_rules (list of {threshold, above_color, below_color})
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    values = data["values"]

    # Default coloring: positive = green, negative = red
    colors = []
    for v in values:
        if v < -5:
            colors.append(palette.red)
        elif v < 0:
            colors.append("#E57373")
        elif v < 5:
            colors.append(palette.green)
        else:
            colors.append(palette.chart_primary)

    y_pos = range(len(labels))
    bars = ax.barh(y_pos, values, color=colors, height=0.6, edgecolor="white",
                   linewidth=0.5, zorder=3)

    ax.set_yticks(list(y_pos))
    ax.set_yticklabels(labels, fontsize=11, fontweight="bold")
    hbar_zero = palette.body_text if _is_dark(palette) else palette.navy
    ax.axvline(x=0, color=hbar_zero, linewidth=1.2)

    if config.get("xlabel"):
        ax.set_xlabel(config["xlabel"], fontsize=11, fontweight="bold")

    # Value labels
    if config.get("show_values", True):
        for bar, val in zip(bars, values):
            x_pos = bar.get_width()
            ha = "left" if val >= 0 else "right"
            offset = 0.5 if val >= 0 else -0.5
            prefix = config.get("value_prefix", "$")
            suffix = config.get("value_suffix", "Bn")
            ax.text(x_pos + offset, bar.get_y() + bar.get_height() / 2,
                    f"{prefix}{val:+.1f}{suffix}", ha=ha, va="center",
                    fontsize=10, fontweight="bold", color=bar.get_facecolor())

    for ann in config.get("annotations", []):
        bbox_props = None
        if ann.get("box", False):
            bbox_props = dict(boxstyle="round,pad=0.4", facecolor=ann.get("box_bg", "#FFEBEE"),
                             edgecolor=ann.get("color", palette.red), alpha=0.9)
        ax.annotate(ann["text"], xy=ann["xy"], xytext=ann.get("xytext", ann["xy"]),
                    fontsize=9, fontweight="bold", color=ann.get("color", palette.red),
                    arrowprops=dict(arrowstyle="->", color=ann.get("color", palette.red), lw=1.5),
                    bbox=bbox_props)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Stacked Bar Chart
# ============================================================================

def render_stacked_bar(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Stacked bar chart for composition over time.

    data:
      labels: ["2022", "2023", ...]
      stacks: [
        {"name": "Germany", "values": [40, 45, ...], "color": "#003366"},
        {"name": "France", "values": [38, 40, ...], "color": "#117ACA"},
        ...
      ]
    config:
      ylabel, ylim, show_totals, annotations
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    stacks = data["stacks"]
    x = np.arange(len(labels))
    width = config.get("bar_width", 0.62)

    default_colors = [palette.chart_primary, palette.chart_secondary, palette.green,
                      palette.orange, palette.gray] + palette.extra_colors

    bottoms = np.zeros(len(labels))
    for i, stack in enumerate(stacks):
        color = stack.get("color", default_colors[i % len(default_colors)])
        vals = stack["values"]
        ax.bar(x, vals, width, bottom=bottoms, label=stack["name"],
               color=color, edgecolor="white", linewidth=0.3, zorder=3)
        bottoms = bottoms + np.array(vals)

    # Show totals above bars
    dark_stacked = _is_dark(palette)
    total_text_color = palette.body_text if dark_stacked else palette.navy
    if config.get("show_totals", True):
        prefix = config.get("total_prefix", "€")
        suffix = config.get("total_suffix", "B")
        for xi, total in zip(x, bottoms):
            ax.text(xi, total + 3, f"{prefix}{int(total)}{suffix}", ha="center", va="bottom",
                    fontsize=9, fontweight="bold", color=total_text_color)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=10, fontweight="bold")
    if config.get("ylabel"):
        ax.set_ylabel(config["ylabel"], fontsize=11, fontweight="bold")
    if config.get("ylim"):
        ax.set_ylim(config["ylim"])
    sleg_bg = palette.chart_bg if dark_stacked else "white"
    sleg = ax.legend(loc=config.get("legend_loc", "upper left"), fontsize=9, framealpha=0.85,
                     ncol=config.get("legend_ncol", len(stacks)),
                     facecolor=sleg_bg, edgecolor=palette.card_border if dark_stacked else "#CCCCCC")
    if dark_stacked:
        for text in sleg.get_texts():
            text.set_color(palette.body_text)

    for ann in config.get("annotations", []):
        bbox_props = None
        if ann.get("box", False):
            bbox_props = dict(boxstyle="round,pad=0.4", facecolor=ann.get("box_bg", "#E3F2FD"),
                             edgecolor=ann.get("color", palette.navy), alpha=0.9)
        ax.annotate(ann["text"], xy=ann["xy"], xytext=ann.get("xytext", ann["xy"]),
                    fontsize=9, fontweight="bold", color=ann.get("color", palette.navy),
                    arrowprops=dict(arrowstyle="->", color=ann.get("color", palette.navy), lw=1.5),
                    bbox=bbox_props)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Table Heatmap (Scoreboard)
# ============================================================================

def render_table_heatmap(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Table with color-coded cells (scoreboard).

    data:
      headers: ["Asset Class", "Ticker", "Price", "1W", "MTD", "YTD", "Signal"]
      rows: [
        ["S&P 500", "SPX", "6,918", "-0.1%", "+1.2%", "+3.4%", "Overbought"],
        ...
      ]
      separators: [6, 10, 14, 17]  # row indices where separator lines appear
    config:
      col_widths: [2.2, 1.1, 1.1, 0.9, 0.9, 0.9, 1.2]
      color_cols: [3, 4, 5, 6]  # which columns get color-coded
      signal_col: 6  # which column is the signal column
    """
    plt = _get_plt()

    headers = data["headers"]
    rows = data["rows"]
    separators = set(data.get("separators", []))
    n_rows = len(rows) + 1
    n_cols = len(headers)

    fig, ax = plt.subplots(figsize=tuple(config.get("figsize", [14, 7.5])))
    ax.set_xlim(0, n_cols)
    ax.set_ylim(0, n_rows)
    ax.axis("off")
    fig.patch.set_facecolor(palette.fig_bg)
    ax.set_facecolor(palette.fig_bg)

    col_widths = config.get("col_widths", [n_cols / n_cols] * n_cols)
    color_cols = set(config.get("color_cols", list(range(3, n_cols))))
    signal_col = config.get("signal_col", n_cols - 1)

    dark = _is_dark(palette)
    cell_bg = palette.chart_bg if dark else palette.white
    cell_border = "#1E2D42" if dark else "#EEEEEE"

    col_x = [0]
    for w in col_widths[:-1]:
        col_x.append(col_x[-1] + w)

    row_h = 0.85

    def val_color(val_str, is_signal=False):
        if dark:
            if is_signal:
                if val_str == "Overbought":
                    return "#2D2010"
                elif val_str == "Oversold":
                    return "#102030"
                return cell_bg
            if not val_str or val_str == "\u2014":
                return cell_bg
            if val_str.startswith("+"):
                return "#0D2D10"
            elif val_str.startswith("-"):
                return "#2D0D10"
            return cell_bg
        else:
            if is_signal:
                if val_str == "Overbought":
                    return "#FFF3E0"
                elif val_str == "Oversold":
                    return "#E3F2FD"
                return palette.white
            if not val_str or val_str == "\u2014":
                return palette.white
            if val_str.startswith("+"):
                return "#E8F5E9"
            elif val_str.startswith("-"):
                return "#FFEBEE"
            return palette.white

    def text_color(val_str, is_signal=False):
        if is_signal:
            if val_str == "Overbought":
                return palette.orange
            elif val_str == "Oversold":
                return palette.chart_secondary
            return palette.gray
        if not val_str or val_str == "\u2014":
            return palette.body_text
        if val_str.startswith("+"):
            return palette.green
        elif val_str.startswith("-"):
            return palette.red
        return palette.body_text

    # Header row
    y_top = n_rows - 0.5
    for j, h in enumerate(headers):
        rect = FancyBboxPatch(
            (col_x[j] + 0.02, y_top - row_h / 2 + 0.15), col_widths[j] - 0.04, row_h - 0.1,
            boxstyle="round,pad=0.03", facecolor=palette.navy, edgecolor="none",
        )
        ax.add_patch(rect)
        ha = "left" if j == 0 else "center"
        x_pos = col_x[j] + 0.12 if j == 0 else col_x[j] + col_widths[j] / 2
        ax.text(x_pos, y_top, h, ha=ha, va="center", fontsize=9, fontweight="bold",
                color=palette.white, fontfamily="Arial")

    # Data rows
    for i, row in enumerate(rows):
        y = n_rows - 1.5 - i
        if i in separators or (len(row) > 0 and row[0] == ""):
            ax.plot([0, n_cols], [y, y], color=palette.light_gray, linewidth=0.5)
            continue

        for j, cell in enumerate(row):
            is_sig = (j == signal_col)
            bg = val_color(cell, is_sig) if j in color_cols else cell_bg
            rect = FancyBboxPatch(
                (col_x[j] + 0.02, y - row_h / 2 + 0.15), col_widths[j] - 0.04, row_h - 0.1,
                boxstyle="round,pad=0.02", facecolor=bg, edgecolor=cell_border, linewidth=0.3,
            )
            ax.add_patch(rect)

            tc = text_color(cell, is_sig) if j in color_cols else palette.body_text
            fw = "bold" if j == 0 or is_sig else "normal"
            ha = "left" if j == 0 else "center"
            x_pos = col_x[j] + 0.12 if j == 0 else col_x[j] + col_widths[j] / 2
            fs = 8.5 if is_sig else 9
            ax.text(x_pos, y, cell, ha=ha, va="center", fontsize=fs, fontweight=fw,
                    color=tc, fontfamily="Arial")

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Gauge Chart
# ============================================================================

def render_gauge(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Horizontal gauge / thermometer for single KPI with zones.

    data:
      value: 8.9
      max_value: 10
      zones: [
        {"start": 0, "end": 2, "label": "EXTREME\\nFEAR / BUY", "color": "#C8E6C9", "border": "#2E865F"},
        {"start": 2, "end": 8, "label": "NEUTRAL ZONE", "color": "#F5F5F5", "border": "#666666"},
        {"start": 8, "end": 10, "label": "EXTREME\\nGREED / SELL", "color": "#FFCDD2", "border": "#CC0000"},
      ]
    config:
      title, subtitle, context_boxes: [{text, x, y, border_color, bg_color}]
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    max_val = data.get("max_value", 10)
    ax.set_xlim(-0.5, max_val + 0.5)
    ax.set_ylim(-1.5, 4.5)
    ax.axis("off")
    fig.patch.set_facecolor(palette.fig_bg)
    ax.set_facecolor(palette.fig_bg)

    bar_y = 2.0
    bar_h = 1.2

    # Draw zones
    for zone in data.get("zones", []):
        width = zone["end"] - zone["start"]
        border_color = zone.get("border", palette.gray)
        lw = 2 if zone["end"] == max_val else 1
        rect = FancyBboxPatch(
            (zone["start"], bar_y), width, bar_h,
            boxstyle="round,pad=0.05",
            facecolor=zone.get("color", "#F5F5F5"),
            edgecolor=border_color, linewidth=lw,
        )
        ax.add_patch(rect)
        center_x = zone["start"] + width / 2
        label_size = 10 if width <= 3 else 12
        ax.text(center_x, bar_y + bar_h / 2, zone.get("label", ""),
                ha="center", va="center", fontsize=label_size,
                fontweight="bold", color=border_color)

    # Current position marker
    value = data["value"]
    ax.plot(value, bar_y - 0.15, "v", color=palette.red, markersize=25, zorder=10)
    ax.plot(value, bar_y + bar_h + 0.15, "^", color=palette.red, markersize=25, zorder=10)

    gauge_box_bg = "#2D0D10" if _is_dark(palette) else "#FFEBEE"
    ax.text(value, bar_y - 0.55, f"CURRENT: {value} / {max_val}",
            ha="center", va="top", fontsize=16, fontweight="bold", color=palette.red,
            bbox=dict(boxstyle="round,pad=0.4", facecolor=gauge_box_bg,
                     edgecolor=palette.red, linewidth=2))

    # Scale markers — show sensible number of ticks (max ~10-12)
    if max_val <= 12:
        tick_step = 1
    elif max_val <= 25:
        tick_step = 5
    elif max_val <= 50:
        tick_step = 10
    else:
        tick_step = max(max_val // 10, 5)
        # Round step to nearest nice number
        for nice in [5, 10, 20, 25, 50]:
            if max_val / nice <= 12:
                tick_step = nice
                break
    for i in range(0, max_val + 1, tick_step):
        ax.text(i, bar_y - 0.05, str(i), ha="center", va="top", fontsize=8, color=palette.gray)

    # Title
    gauge_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
    if config.get("title"):
        ax.text(max_val / 2, 4.2, config["title"], ha="center", va="center",
                fontsize=18, fontweight="bold", color=gauge_title_color)
    if config.get("subtitle"):
        ax.text(max_val / 2, 3.75, config["subtitle"], ha="center", va="center",
                fontsize=12, color=palette.red, fontweight="bold")

    # Context boxes
    for box in config.get("context_boxes", []):
        ax.text(box.get("x", 0.3), box.get("y", 0.3), box["text"],
                fontsize=9, color=palette.navy, va="top",
                bbox=dict(boxstyle="round,pad=0.5",
                         facecolor=box.get("bg_color", "#F5F5F5"),
                         edgecolor=box.get("border_color", palette.gray), alpha=0.9),
                fontfamily="Arial")

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Donut + Conviction Matrix
# ============================================================================

def render_donut_matrix(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Combined donut chart (left) + conviction matrix table (right).

    data:
      donut:
        labels: ["DM Equity\\n35%", ...]
        sizes: [35, 8, 20, ...]
        colors: ["#003366", "#117ACA", ...]
        center_text: "Model\\nPortfolio"
      matrix:
        headers: ["Asset Class", "View", "Chg", "Rationale"]
        rows: [
          ["US Large Cap", "OW", "↓", "Reduce Mag7"],
          ...
        ]
    config:
      donut_title, matrix_title
    """
    plt = _get_plt()
    fig = plt.figure(figsize=tuple(config.get("figsize", [14, 5.5])))
    fig.patch.set_facecolor(palette.fig_bg)

    # LEFT: Donut
    ax1 = fig.add_axes([0.02, 0.05, 0.42, 0.9])
    ax1.set_facecolor(palette.fig_bg)

    donut = data.get("donut", {})
    labels = donut.get("labels", [])
    sizes = donut.get("sizes", [])
    default_colors = [palette.chart_primary, palette.chart_secondary, "#5B9BD5",
                      palette.green, palette.orange, palette.gold, palette.gray]
    colors_pie = donut.get("colors", default_colors[:len(sizes)])

    edge_color = palette.fig_bg if _is_dark(palette) else palette.white
    wedges, _, _ = ax1.pie(
        sizes, labels=None, autopct="", startangle=90,
        colors=colors_pie, pctdistance=0.8,
        wedgeprops=dict(width=0.4, edgecolor=edge_color, linewidth=2),
    )

    for i, (wedge, label) in enumerate(zip(wedges, labels)):
        ang = (wedge.theta2 - wedge.theta1) / 2.0 + wedge.theta1
        x = 1.25 * np.cos(np.deg2rad(ang))
        y = 1.25 * np.sin(np.deg2rad(ang))
        ha = "left" if x >= 0 else "right"
        ax1.text(x, y, label, ha=ha, va="center", fontsize=8.5, fontweight="bold",
                 color=colors_pie[i % len(colors_pie)])

    donut_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
    center_text = donut.get("center_text", "")
    if center_text:
        ax1.text(0, 0, center_text, ha="center", va="center",
                 fontsize=10, fontweight="bold", color=donut_title_color)

    ax1.set_title(config.get("donut_title", "Strategic Allocation"),
                  fontsize=12, fontweight="bold", color=donut_title_color, pad=10)

    # RIGHT: Conviction matrix
    dark = _is_dark(palette)
    ax2 = fig.add_axes([0.50, 0.05, 0.48, 0.9])
    ax2.axis("off")
    ax2.set_facecolor(palette.fig_bg)
    ax2.set_xlim(0, 10)
    ax2.set_ylim(0, 10)

    matrix = data.get("matrix", {})
    headers = matrix.get("headers", [])
    rows = matrix.get("rows", [])
    col_x = [0, 2.3, 3.5, 4.3]
    col_w = [2.3, 1.2, 0.8, 5.7]
    row_h = 0.95

    matrix_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
    ax2.text(5, 9.7, config.get("matrix_title", "Conviction Matrix"),
             fontsize=12, fontweight="bold", color=matrix_title_color, ha="center")

    # Header
    y = 9.0
    for j, h in enumerate(headers):
        rect = FancyBboxPatch(
            (col_x[j], y - row_h / 2 + 0.05), col_w[j] - 0.05, row_h - 0.1,
            boxstyle="round,pad=0.02", facecolor=palette.navy, edgecolor="none",
        )
        ax2.add_patch(rect)
        x_txt = col_x[j] + 0.15 if j in (0, 3) else col_x[j] + col_w[j] / 2
        ha = "left" if j in (0, 3) else "center"
        ax2.text(x_txt, y, h, ha=ha, va="center", fontsize=8, fontweight="bold",
                 color=palette.white)

    # Data rows
    cell_bg_default = palette.chart_bg if dark else palette.white
    cell_edge = "#1E2D42" if dark else "#EEEEEE"
    for i, row in enumerate(rows):
        y = 8.0 - i * row_h
        view = row[1] if len(row) > 1 else ""
        if dark:
            bg = "#0D2D10" if view == "OW" else ("#2D0D10" if view == "UW" else cell_bg_default)
        else:
            bg = "#E8F5E9" if view == "OW" else ("#FFEBEE" if view == "UW" else palette.white)

        for j, cell in enumerate(row):
            rect = FancyBboxPatch(
                (col_x[j], y - row_h / 2 + 0.05), col_w[j] - 0.05, row_h - 0.1,
                boxstyle="round,pad=0.02", facecolor=bg, edgecolor=cell_edge, linewidth=0.3,
            )
            ax2.add_patch(rect)

            tc = palette.body_text
            fw = "bold" if j <= 2 else "normal"
            if j == 1:
                tc = palette.green if view == "OW" else (palette.red if view == "UW" else palette.gray)
            if j == 2:
                if "\u2191" in cell:
                    tc = palette.green
                elif "\u2193" in cell:
                    tc = palette.red
                else:
                    tc = palette.gray

            x_txt = col_x[j] + 0.15 if j in (0, 3) else col_x[j] + col_w[j] / 2
            ha = "left" if j in (0, 3) else "center"
            ax2.text(x_txt, y, cell, ha=ha, va="center", fontsize=8, fontweight=fw, color=tc)

    if source:
        add_source_text(ax2, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Waterfall Chart (attribution analysis)
# ============================================================================

def render_waterfall(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Waterfall chart for attribution / decomposition analysis.

    data:
      labels: ["Start", "Equities", "Bonds", "FX", "Alt", "End"]
      values: [100, 5.2, -1.3, 0.8, 2.1, 106.8]
      is_total: [true, false, false, false, false, true]
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    values = data["values"]
    is_total = data.get("is_total", [i == 0 or i == len(values) - 1 for i in range(len(values))])

    dark = _is_dark(palette)
    n = len(values)
    x = np.arange(n)

    bottoms = []
    running = 0
    for i, (v, total) in enumerate(zip(values, is_total)):
        if total:
            bottoms.append(0)
            running = v
        else:
            if v >= 0:
                bottoms.append(running)
                running += v
            else:
                running += v
                bottoms.append(running)

    bar_colors = []
    for i, (v, total) in enumerate(zip(values, is_total)):
        if total:
            bar_colors.append(palette.chart_primary)
        elif v >= 0:
            bar_colors.append(palette.green)
        else:
            bar_colors.append(palette.red)

    display_values = [v if total else abs(v) for v, total in zip(values, is_total)]
    bars = ax.bar(x, display_values, bottom=bottoms, color=bar_colors,
                  width=0.6, edgecolor="white", linewidth=0.5, zorder=3)

    if config.get("show_connectors", True):
        for i in range(n - 1):
            top = values[i] if is_total[i] else bottoms[i] + display_values[i]
            conn_color = palette.body_text if dark else "#AAAAAA"
            ax.plot([x[i] + 0.3, x[i + 1] - 0.3], [top, top],
                    color=conn_color, linewidth=0.8, linestyle="--", alpha=0.5)

    for bar, v, b, total in zip(bars, values, bottoms, is_total):
        y_pos = b + abs(v) + (max(values) - min(values)) * 0.02
        label_color = palette.body_text if dark else "#333333"
        prefix = "+" if v > 0 and not total else ""
        suffix = config.get("value_suffix", "")
        ax.text(bar.get_x() + bar.get_width() / 2, y_pos,
                f"{prefix}{v}{suffix}", ha="center", va="bottom",
                fontsize=10, fontweight="bold", color=label_color)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11, fontweight="bold")
    zero_color = palette.body_text if dark else palette.navy
    ax.axhline(y=0, color=zero_color, linewidth=0.8)

    if config.get("ylabel"):
        ax.set_ylabel(config["ylabel"], fontsize=11, fontweight="bold")

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Return Quilt (JPMorgan Periodic Table of Returns)
# ============================================================================

def render_return_quilt(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Return quilt — THE institutional chart (JPMorgan GTTM style).

    data:
      years: ["2015", "2016", ...]
      assets: ["US Equity", "EM Equity", "Bonds", ...]
      returns: [[5.2, -3.1, ...], ...]  (years × assets)
    config:
      title, figsize, color_mode ("gradient" | "categorical"), show_values (bool)
    """
    plt = _get_plt()
    from matplotlib.colors import LinearSegmentedColormap
    figsize = tuple(config.get("figsize", [14, 8]))
    fig, ax = plt.subplots(figsize=figsize)

    years = data["years"]
    assets = data["assets"]
    returns = np.array(data["returns"])  # shape: (n_years, n_assets)

    n_years = len(years)
    n_assets = len(assets)

    color_mode = config.get("color_mode", "gradient")

    # Assign colors per asset for categorical mode
    asset_colors = {}
    cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
        palette.chart_primary, palette.chart_secondary, palette.green,
        palette.red, palette.orange, palette.gray
    ]
    for i, asset in enumerate(assets):
        asset_colors[asset] = cycle[i % len(cycle)]

    # Gradient colormap for performance coloring
    # Use institutional blue→white→green (not red→white→green) for better readability
    # Red is reserved for text of negative values, not cell backgrounds
    all_vals = returns.flatten()
    vmin, vmax = np.nanmin(all_vals), np.nanmax(all_vals)
    neg_color = "#D4E6F1" if not _is_dark(palette) else "#1A3A5C"  # muted blue for negative
    mid_color = "#FFFFFF" if not _is_dark(palette) else "#1E2D42"  # white/dark mid
    pos_color = "#C8E6C9" if not _is_dark(palette) else "#1B4332"  # muted green for positive
    cmap = LinearSegmentedColormap.from_list("quilt", [neg_color, mid_color, pos_color])

    ax.set_xlim(-0.5, n_years - 0.5)
    ax.set_ylim(-0.5, n_assets - 0.5)
    ax.set_facecolor(palette.fig_bg)
    fig.patch.set_facecolor(palette.fig_bg)

    dark = _is_dark(palette)

    for yi in range(n_years):
        # Sort assets by return for this year (best at top)
        col = returns[yi]
        sorted_indices = np.argsort(col)[::-1]

        for rank, ai in enumerate(sorted_indices):
            val = col[ai]
            asset_name = assets[ai]

            if color_mode == "categorical":
                cell_color = asset_colors[asset_name]
                text_color = "#FFFFFF"
            else:
                norm_val = (val - vmin) / (vmax - vmin + 1e-9)
                cell_color = cmap(norm_val)
                # Text color: use red for negative, green for positive, dark for near-zero
                if dark:
                    text_color = "#FF6B6B" if val < -5 else ("#66BB6A" if val > 5 else "#E8EDF3")
                else:
                    text_color = "#B71C1C" if val < -5 else ("#1B5E20" if val > 5 else "#1A1A2E")

            rect = plt.Rectangle((yi - 0.45, n_assets - 1 - rank - 0.45), 0.9, 0.9,
                                  facecolor=cell_color, edgecolor="white", linewidth=0.5)
            ax.add_patch(rect)

            # Cell text: asset name + return
            cell_text = f"{asset_name}\n{val:+.1f}%"
            fw = "bold" if rank == 0 or rank == n_assets - 1 else "normal"
            ax.text(yi, n_assets - 1 - rank, cell_text, ha="center", va="center",
                    fontsize=7, fontweight=fw, color=text_color)

    ax.set_xticks(range(n_years))
    ax.set_xticklabels(years, fontsize=9, fontweight="bold")
    ax.set_yticks([])
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)

    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Scatter Plot (Goldman Sachs style)
# ============================================================================

def render_scatter(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Scatter plot with labels (Goldman Sachs Research style).

    data:
      points: [{x, y, label, size?, color?}]
      x_label, y_label
      quadrant_labels: {tl, tr, bl, br} (optional)
      trend_line: bool (optional)
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [10, 7]))
    fig, ax = plt.subplots(figsize=figsize)

    points = data.get("points", [])
    dark = _is_dark(palette)

    for pt in points:
        size = pt.get("size", 80)
        color = pt.get("color", palette.chart_primary)
        ax.scatter(pt["x"], pt["y"], s=size, c=color, alpha=0.8, edgecolors="white",
                   linewidth=0.5, zorder=5)
        if pt.get("label"):
            ax.annotate(pt["label"], (pt["x"], pt["y"]), xytext=(6, 6),
                        textcoords="offset points", fontsize=7, color=palette.body_text)

    if data.get("x_label"):
        ax.set_xlabel(data["x_label"], fontsize=11, fontweight="bold")
    if data.get("y_label"):
        ax.set_ylabel(data["y_label"], fontsize=11, fontweight="bold")

    # Quadrant lines and labels
    ql = data.get("quadrant_labels")
    if ql:
        xlim = ax.get_xlim()
        ylim = ax.get_ylim()
        mid_x = (xlim[0] + xlim[1]) / 2
        mid_y = (ylim[0] + ylim[1]) / 2
        q_color = palette.light_gray if not dark else "#1E2D42"
        ax.axhline(y=mid_y, color=q_color, linestyle="--", linewidth=0.8, alpha=0.6)
        ax.axvline(x=mid_x, color=q_color, linestyle="--", linewidth=0.8, alpha=0.6)
        q_fs = 8
        q_alpha = 0.5
        ax.text(xlim[0] + (mid_x - xlim[0]) * 0.05, ylim[1] - (ylim[1] - mid_y) * 0.05,
                ql.get("tl", ""), fontsize=q_fs, color=palette.gray, alpha=q_alpha, va="top")
        ax.text(xlim[1] - (xlim[1] - mid_x) * 0.05, ylim[1] - (ylim[1] - mid_y) * 0.05,
                ql.get("tr", ""), fontsize=q_fs, color=palette.gray, alpha=q_alpha, va="top", ha="right")
        ax.text(xlim[0] + (mid_x - xlim[0]) * 0.05, ylim[0] + (mid_y - ylim[0]) * 0.05,
                ql.get("bl", ""), fontsize=q_fs, color=palette.gray, alpha=q_alpha, va="bottom")
        ax.text(xlim[1] - (xlim[1] - mid_x) * 0.05, ylim[0] + (mid_y - ylim[0]) * 0.05,
                ql.get("br", ""), fontsize=q_fs, color=palette.gray, alpha=q_alpha, va="bottom", ha="right")

    # Trend line (linear regression)
    if data.get("trend_line") and len(points) >= 2:
        xs = np.array([p["x"] for p in points])
        ys = np.array([p["y"] for p in points])
        z = np.polyfit(xs, ys, 1)
        p = np.poly1d(z)
        x_line = np.linspace(xs.min(), xs.max(), 100)
        ax.plot(x_line, p(x_line), color=palette.red, linewidth=1.5, linestyle="--", alpha=0.6)

    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Sparkline Table (Bloomberg style)
# ============================================================================

def render_sparkline_table(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Table with inline sparklines (Bloomberg style).

    data:
      headers: ["Asset", "Price", "Chg", "Trend"]
      rows: [{cells: ["S&P 500", "6,918", "+1.2%"], sparkline: [100, 99, 101, 103, 102]}]
    config:
      figsize, col_widths
    """
    plt = _get_plt()
    import matplotlib.gridspec as gridspec

    rows = data.get("rows", [])
    headers = data.get("headers", [])
    n_rows = len(rows)
    n_cols = len(headers)

    figsize = tuple(config.get("figsize", [14, max(3, n_rows * 0.6 + 1)]))
    fig = plt.figure(figsize=figsize)
    fig.patch.set_facecolor(palette.fig_bg)

    dark = _is_dark(palette)

    # Grid: one row for headers + one per data row; n_cols columns for text + 1 for sparkline
    gs = gridspec.GridSpec(n_rows + 1, n_cols + 1, figure=fig,
                           hspace=0.05, wspace=0.05,
                           left=0.02, right=0.98, top=0.95, bottom=0.05)

    # Header row
    for j, h in enumerate(headers):
        ax_h = fig.add_subplot(gs[0, j])
        ax_h.set_xlim(0, 1)
        ax_h.set_ylim(0, 1)
        ax_h.axis("off")
        ax_h.set_facecolor(palette.navy)
        rect = plt.Rectangle((0, 0), 1, 1, facecolor=palette.navy, edgecolor="none")
        ax_h.add_patch(rect)
        ax_h.text(0.5, 0.5, h, ha="center", va="center", fontsize=9,
                  fontweight="bold", color=palette.white)
    # Sparkline header
    ax_sh = fig.add_subplot(gs[0, n_cols])
    ax_sh.axis("off")
    ax_sh.set_facecolor(palette.navy)
    rect = plt.Rectangle((0, 0), 1, 1, transform=ax_sh.transAxes,
                          facecolor=palette.navy, edgecolor="none")
    ax_sh.add_patch(rect)
    ax_sh.text(0.5, 0.5, "Trend", ha="center", va="center", fontsize=9,
               fontweight="bold", color=palette.white)

    # Data rows
    for i, row in enumerate(rows):
        cells = row.get("cells", [])
        sparkline_data = row.get("sparkline", [])
        bg_color = palette.chart_bg if i % 2 == 0 else (palette.fig_bg if not dark else "#0F1B2D")

        for j in range(n_cols):
            ax_c = fig.add_subplot(gs[i + 1, j])
            ax_c.set_xlim(0, 1)
            ax_c.set_ylim(0, 1)
            ax_c.axis("off")
            rect = plt.Rectangle((0, 0), 1, 1, facecolor=bg_color, edgecolor="#EEEEEE" if not dark else "#1E2D42",
                                  linewidth=0.3)
            ax_c.add_patch(rect)

            cell_text = cells[j] if j < len(cells) else ""
            tc = palette.body_text
            if cell_text.startswith("+"):
                tc = palette.green
            elif cell_text.startswith("-"):
                tc = palette.red
            fw = "bold" if j == 0 else "normal"
            ax_c.text(0.5, 0.5, cell_text, ha="center", va="center",
                      fontsize=8, fontweight=fw, color=tc)

        # Sparkline mini-chart
        ax_s = fig.add_subplot(gs[i + 1, n_cols])
        ax_s.set_facecolor(bg_color)
        if sparkline_data and len(sparkline_data) >= 2:
            trend_up = sparkline_data[-1] >= sparkline_data[0]
            spark_color = palette.green if trend_up else palette.red
            ax_s.plot(sparkline_data, color=spark_color, linewidth=1.2)
            ax_s.fill_between(range(len(sparkline_data)), sparkline_data,
                              min(sparkline_data), alpha=0.15, color=spark_color)
        ax_s.axis("off")

    if source:
        fig.text(0.02, 0.01, source, fontsize=7, color=palette.source_color, fontstyle="italic")

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Lollipop Chart
# ============================================================================

def render_lollipop(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Lollipop chart (dot + stem) — elegant alternative to bar chart.

    data:
      categories: ["A", "B", ...]
      values: [10, -5, ...]
    config:
      sort (bool), xlabel, title, figsize
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [12, 6]))
    fig, ax = plt.subplots(figsize=figsize)

    categories = data["categories"]
    values = np.array(data["values"], dtype=float)

    if config.get("sort", False):
        order = np.argsort(values)
        categories = [categories[i] for i in order]
        values = values[order]

    y_pos = np.arange(len(categories))
    colors = [palette.green if v >= 0 else palette.red for v in values]

    ax.hlines(y=y_pos, xmin=0, xmax=values, color=colors, linewidth=1.5, zorder=3)
    ax.scatter(values, y_pos, c=colors, s=64, zorder=5, edgecolors="white", linewidth=0.5)

    ax.set_yticks(y_pos)
    ax.set_yticklabels(categories, fontsize=10, fontweight="bold")
    ax.axvline(x=0, color=palette.gray, linewidth=0.8)

    if config.get("xlabel"):
        ax.set_xlabel(config["xlabel"], fontsize=11, fontweight="bold")
    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Dumbbell Chart
# ============================================================================

def render_dumbbell(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Dumbbell chart — shows change between two points.

    data:
      categories: ["A", "B", ...]
      start: [10, 20, ...]
      end: [15, 18, ...]
      start_label: "2024"
      end_label: "2025"
    config:
      xlabel, title, figsize
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [12, 6]))
    fig, ax = plt.subplots(figsize=figsize)

    categories = data["categories"]
    start_vals = np.array(data["start"], dtype=float)
    end_vals = np.array(data["end"], dtype=float)
    start_label = data.get("start_label", "Start")
    end_label = data.get("end_label", "End")

    y_pos = np.arange(len(categories))

    # Connector lines
    for i in range(len(categories)):
        ax.hlines(y=i, xmin=min(start_vals[i], end_vals[i]),
                  xmax=max(start_vals[i], end_vals[i]),
                  color=palette.light_gray, linewidth=2.5, zorder=2)

    # Start and end dots
    ax.scatter(start_vals, y_pos, s=100, c=palette.gray, zorder=5, label=start_label, edgecolors="white")
    ax.scatter(end_vals, y_pos, s=100, c=palette.chart_primary, zorder=5, label=end_label, edgecolors="white")

    ax.set_yticks(y_pos)
    ax.set_yticklabels(categories, fontsize=10, fontweight="bold")
    ax.legend(loc="lower right", fontsize=9)

    if config.get("xlabel"):
        ax.set_xlabel(config["xlabel"], fontsize=11, fontweight="bold")
    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Area Chart
# ============================================================================

def render_area(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Area chart (single or stacked).

    data:
      labels: ["Jan", "Feb", ...]
      series: [{name, values}]
    config:
      stacked (bool, default false), ylabel, title, figsize
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 5.5]))
    fig, ax = plt.subplots(figsize=figsize)

    labels = data["labels"]
    series_list = data["series"]
    x = range(len(labels))

    cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
        palette.chart_primary, palette.chart_secondary, palette.green
    ]

    if config.get("stacked", False) and len(series_list) > 1:
        stack_data = [s["values"] for s in series_list]
        stack_labels = [s["name"] for s in series_list]
        stack_colors = [s.get("color", cycle[i % len(cycle)]) for i, s in enumerate(series_list)]
        ax.stackplot(x, *stack_data, labels=stack_labels, colors=stack_colors, alpha=0.7)
        ax.legend(loc="upper left", fontsize=9)
    else:
        for i, s in enumerate(series_list):
            color = s.get("color", cycle[i % len(cycle)])
            ax.plot(x, s["values"], color=color, linewidth=2, label=s["name"], zorder=3)
            ax.fill_between(x, s["values"], alpha=0.3, color=color)

        if len(series_list) > 1:
            ax.legend(loc="upper left", fontsize=9)

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=9)

    if config.get("ylabel"):
        ax.set_ylabel(config["ylabel"], fontsize=11, fontweight="bold")
    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Bump Chart (ranking over time)
# ============================================================================

def render_bump(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Bump chart — ranking over time.

    data:
      periods: ["2020", "2021", ...]
      series: [{name, ranks: [1, 3, 2, ...]}]
    config:
      title, figsize
    """
    plt = _get_plt()
    figsize = tuple(config.get("figsize", [14, 6]))
    fig, ax = plt.subplots(figsize=figsize)

    periods = data["periods"]
    series_list = data["series"]
    x = range(len(periods))

    cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
        palette.chart_primary, palette.chart_secondary, palette.green, palette.red
    ]

    n_series = len(series_list)
    for i, s in enumerate(series_list):
        color = s.get("color", cycle[i % len(cycle)])
        ranks = s["ranks"]
        lw = max(1.5, 3.5 - i * 0.3)
        ax.plot(x, ranks, color=color, linewidth=lw, marker="o", markersize=8,
                zorder=5 + n_series - i, label=s["name"])

        # Labels at left and right
        ax.text(-0.3, ranks[0], s["name"], ha="right", va="center",
                fontsize=8, color=color, fontweight="bold")
        ax.text(len(periods) - 1 + 0.3, ranks[-1], s["name"], ha="left", va="center",
                fontsize=8, color=color, fontweight="bold")

    ax.set_xticks(list(x))
    ax.set_xticklabels(periods, fontsize=10, fontweight="bold")
    ax.invert_yaxis()  # Rank 1 = top
    ax.set_ylabel("Rank", fontsize=11, fontweight="bold")
    max_rank = max(r for s in series_list for r in s["ranks"])
    ax.set_yticks(range(1, max_rank + 1))

    if config.get("title"):
        ax.set_title(config["title"], fontsize=14, fontweight="bold", pad=15)

    if source:
        add_source_text(ax, source, palette)

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path


# ============================================================================
# Small Multiples (Tufte's most powerful pattern)
# ============================================================================

def render_small_multiples(data: dict, config: dict, palette, source: str, output_path: str) -> str:
    """
    Small multiples — grid of mini charts with shared axes.

    data:
      panels: [{title, labels, values}]
    config:
      chart_type: "line" | "bar" (default "line")
      title, figsize, ncols
    """
    plt = _get_plt()

    panels = data["panels"]
    n = len(panels)
    ncols = config.get("ncols", min(4, n))
    nrows = (n + ncols - 1) // ncols

    figsize = tuple(config.get("figsize", [3.5 * ncols, 2.5 * nrows]))
    fig, axes = plt.subplots(nrows, ncols, figsize=figsize, squeeze=False)
    fig.patch.set_facecolor(palette.fig_bg)

    chart_type = config.get("chart_type", "line")

    # Determine Y limits: shared only when ranges are comparable (< 10x ratio)
    # or when explicitly requested via config.shared_y
    shared_y = config.get("shared_y", None)  # None = auto, True = force, False = never
    ylim_per_panel = [None] * n

    all_vals = [v for p in panels for v in p.get("values", [])]
    if all_vals and shared_y is not False:
        # Compute per-panel ranges to detect incompatible scales
        panel_ranges = []
        for p in panels:
            pv = p.get("values", [])
            if pv:
                pr = max(pv) - min(pv)
                panel_ranges.append(pr if pr > 0 else 1)
            else:
                panel_ranges.append(1)

        max_range = max(panel_ranges)
        min_range = min(panel_ranges)
        ratio = max_range / min_range if min_range > 0 else float('inf')

        if shared_y is True or ratio < 10:
            # Ranges are comparable → share Y axis
            shared_min = min(all_vals)
            shared_max = max(all_vals)
            margin = (shared_max - shared_min) * 0.1 or 1
            global_ylim = (shared_min - margin, shared_max + margin)
            ylim_per_panel = [global_ylim] * n
        # else: each panel gets its own Y limits (auto)

    for idx in range(nrows * ncols):
        row, col = divmod(idx, ncols)
        ax = axes[row][col]

        if idx >= n:
            ax.axis("off")
            continue

        panel = panels[idx]
        labels = panel.get("labels", [])
        values = panel.get("values", [])
        x = range(len(labels))

        if chart_type == "bar":
            colors = [palette.green if v >= 0 else palette.red for v in values]
            ax.bar(x, values, color=colors, width=0.6, edgecolor="white", linewidth=0.3)
        else:
            ax.plot(x, values, color=palette.chart_primary, linewidth=1.5)
            ax.fill_between(x, values, alpha=0.15, color=palette.chart_primary)

        ax.set_title(panel.get("title", ""), fontsize=9, fontweight="bold", pad=4)
        if ylim_per_panel[idx]:
            ax.set_ylim(ylim_per_panel[idx])
        ax.tick_params(labelsize=6)
        if len(labels) > 0:
            step = max(1, len(labels) // 4)
            ax.set_xticks(list(x)[::step])
            ax.set_xticklabels([labels[i] for i in range(0, len(labels), step)], fontsize=6)

    if config.get("title"):
        fig.suptitle(config["title"], fontsize=14, fontweight="bold", y=1.02)

    fig.tight_layout()

    if source:
        fig.text(0.02, 0.01, source, fontsize=7, color=palette.source_color, fontstyle="italic")

    fig.savefig(output_path, dpi=250, bbox_inches="tight", facecolor=palette.fig_bg)
    plt.close(fig)
    return output_path
