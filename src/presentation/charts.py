"""
Genesis Presentation Engine — Chart Factory (Plotly Edition)

Parameterized chart renderers using Plotly instead of matplotlib.
Every function receives data from JSON spec, ZERO hardcoded data.
Each renderer returns the path to the saved PNG.
"""

import os
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def _is_dark(palette) -> bool:
    """Check if palette is dark mode."""
    return palette.fig_bg not in ("#FFFFFF", "#FAFBFC")


def _institutional_layout(palette, config: dict) -> dict:
    """
    Return Plotly layout params for institutional chart style:
    - No top/right borders (Plotly doesn't have spines, use showline on axes)
    - Horizontal gridlines only
    - Arial font
    - Transparent/matching background
    """
    dark = _is_dark(palette)

    return dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.chart_bg,
        font=dict(
            family="Arial, Helvetica, sans-serif",
            size=10,
            color=palette.body_text,
        ),
        xaxis=dict(
            showgrid=False,
            showline=True,
            linecolor=palette.gray,
            linewidth=1,
            mirror=False,
            zeroline=False,
            color=palette.body_text,
        ),
        yaxis=dict(
            showgrid=True,
            gridcolor=palette.light_gray,
            gridwidth=0.4,
            showline=False,
            zeroline=False,
            mirror=False,
            color=palette.body_text,
        ),
        margin=dict(l=50, r=50, t=45, b=65),
    )


def _source_annotation(text: str, palette) -> dict:
    """Return annotation dict for source text at bottom-left."""
    return dict(
        text=text,
        xref="paper",
        yref="paper",
        x=0,
        y=-0.15,
        xanchor="left",
        yanchor="top",
        font=dict(size=7, color=palette.source_color, family="Arial"),
        showarrow=False,
        bgcolor="rgba(0,0,0,0)",
    )


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
    labels = data["labels"]
    x = list(range(len(labels)))

    fig = go.Figure()

    dark = _is_dark(palette)
    markers_list = ["circle", "square", "diamond", "cross", "x", "triangle-up", "star"]

    for i, series in enumerate(data["series"]):
        color = series.get("color", palette.chart_primary if i == 0 else palette.chart_secondary)
        marker = markers_list[i % len(markers_list)]
        line_style = series.get("linestyle", "-")
        lw = series.get("linewidth", 2.5)
        label = series.get("name", f"Series {i+1}")

        # Map matplotlib line styles to Plotly
        plotly_dash = "solid"
        if line_style == "--":
            plotly_dash = "dash"
        elif line_style == "-.":
            plotly_dash = "dashdot"
        elif line_style == ":":
            plotly_dash = "dot"

        # Glow effect on dark backgrounds: wider semi-transparent trace behind
        if dark:
            fig.add_trace(go.Scatter(
                x=x,
                y=series["values"],
                mode='lines',
                line=dict(color=color, width=lw * 3.5, dash=plotly_dash),
                opacity=0.12,
                showlegend=False,
                hoverinfo='skip',
            ))

        # Main line
        fill_mode = None
        if config.get("fill", False) or dark:
            fill_mode = "tozeroy"

        fig.add_trace(go.Scatter(
            x=x,
            y=series["values"],
            mode='lines+markers',
            name=label,
            line=dict(color=color, width=lw, dash=plotly_dash),
            marker=dict(symbol=marker, size=6, color=color),
            fill=fill_mode,
            fillcolor=f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, {0.15 if dark else 0.08})" if fill_mode else None,
        ))

    # Shaded regions (recession bands)
    for region in data.get("shaded_regions", []):
        r_start = region["start"]
        r_end = region["end"]
        r_color = region.get("color", "#CCCCCC" if not dark else "#1E2D42")
        fig.add_vrect(
            x0=r_start, x1=r_end,
            fillcolor=r_color,
            opacity=0.15,
            layer="below",
            line_width=0,
        )
        if region.get("label"):
            mid_x = (r_start + r_end) / 2
            fig.add_annotation(
                x=mid_x,
                y=0.5,
                yref="paper",
                text=region["label"],
                textangle=-90,
                font=dict(size=7, color=palette.gray),
                opacity=0.7,
                showarrow=False,
            )

    # Slope labels (right-side annotations)
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
                    fig.add_annotation(
                        x=len(labels) - 1,
                        y=last_val,
                        text=label_text,
                        xanchor="left",
                        xshift=8,
                        font=dict(size=8, color=color),
                        showarrow=False,
                    )

    # Data-level annotations
    for ann in data.get("annotations", []):
        ann_x = ann.get("x", 0)
        ann_y = ann.get("y", 0)
        ann_text = ann.get("text", "")
        ann_arrow = ann.get("arrow", False)

        fig.add_annotation(
            x=ann_x,
            y=ann_y,
            text=ann_text,
            font=dict(size=7, color=palette.body_text),
            showarrow=ann_arrow,
            arrowcolor=palette.navy,
            arrowwidth=1.2,
            ax=15,
            ay=15,
            bgcolor="#E3F2FD" if not dark else "#152238",
            bordercolor=palette.gray,
            borderwidth=1,
            opacity=0.85,
        )

    # Baseline
    if "baseline" in config:
        bl_color = "#2A3A4A" if dark else "#CCCCCC"
        fig.add_hline(y=config["baseline"], line_dash="dash", line_color=bl_color, line_width=0.8)

    # Vertical event lines
    for vline in config.get("vlines", []):
        vl_color = vline.get("color", palette.navy)
        vl_style = vline.get("style", "--")
        plotly_vl_dash = "dash" if vl_style == "--" else "solid"
        fig.add_vline(
            x=vline["x"],
            line_dash=plotly_vl_dash,
            line_color=vl_color,
            line_width=1.5,
            opacity=0.6,
        )
        if vline.get("label"):
            fig.add_annotation(
                x=vline["x"],
                y=1,
                yref="paper",
                text=vline["label"],
                font=dict(size=8, color=vl_color),
                showarrow=False,
                yanchor="top",
                xshift=5,
            )

    # Horizontal reference lines
    for hline in config.get("hlines", []):
        hl_color = hline.get("color", palette.red)
        hl_style = hline.get("style", "--")
        plotly_hl_dash = "dash" if hl_style == "--" else "solid"
        fig.add_hline(
            y=hline["y"],
            line_dash=plotly_hl_dash,
            line_color=hl_color,
            line_width=1.2,
            opacity=0.5,
        )
        if hline.get("label"):
            fig.add_annotation(
                x=0.5,
                xref="paper",
                y=hline["y"],
                text=hline["label"],
                font=dict(size=8, color=hl_color),
                showarrow=False,
                yshift=5,
            )

    # Config-level annotations
    for ann in config.get("annotations", []):
        ann_xy = ann.get("xy", [0, 0])
        ann_xytext = ann.get("xytext", ann_xy)
        fig.add_annotation(
            x=ann_xy[0],
            y=ann_xy[1],
            text=ann["text"],
            font=dict(size=ann.get("fontsize", 9), color=ann.get("color", palette.navy)),
            showarrow=ann.get("arrow", True),
            arrowcolor=ann.get("color", palette.navy),
            arrowwidth=1.5,
            ax=ann_xytext[0] - ann_xy[0] if ann_xytext != ann_xy else 0,
            ay=ann_xytext[1] - ann_xy[1] if ann_xytext != ann_xy else -30,
            bgcolor=ann.get("box_bg", "#E3F2FD") if ann.get("box", False) else None,
            bordercolor=ann.get("color", palette.navy) if ann.get("box", False) else None,
            borderwidth=1 if ann.get("box", False) else 0,
            opacity=0.9 if ann.get("box", False) else 1,
        )

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["xaxis"]["tickmode"] = "array"
    layout["xaxis"]["tickvals"] = x
    layout["xaxis"]["ticktext"] = labels
    layout["xaxis"]["tickangle"] = config.get("x_rotation", 0)

    if config.get("ylabel"):
        layout["yaxis"]["title"] = dict(text=config["ylabel"], font=dict(size=11))
    if config.get("ylim"):
        layout["yaxis"]["range"] = config["ylim"]
    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    if len(data["series"]) > 1:
        layout["legend"] = dict(
            bgcolor="rgba(255,255,255,0.85)" if not dark else f"rgba({int(palette.chart_bg[1:3], 16)}, {int(palette.chart_bg[3:5], 16)}, {int(palette.chart_bg[5:7], 16)}, 0.85)",
            bordercolor=palette.card_border if dark else "#CCCCCC",
            borderwidth=0.5,
            orientation="h",
            x=0,
            y=1.02,
            xanchor="left",
            yanchor="bottom",
        )

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)

    # Export to PNG (3333x1375 = 250 DPI at 13.33"×5.5")
    fig.write_image(output_path, width=3333, height=1375)
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
    labels = data["labels"]
    groups = data.get("groups", [])
    n_groups = len(groups)

    fig = go.Figure()
    dark = _is_dark(palette)

    if n_groups == 0:
        # Single series shorthand
        values = data.get("values", [])
        colors = [palette.green if v >= 0 else palette.red for v in values]

        fig.add_trace(go.Bar(
            x=labels,
            y=values,
            marker=dict(color=colors, line=dict(color="white", width=0.5)),
            showlegend=False,
            text=[f"${v}B" if config.get("value_prefix") == "$" else f"{v}" for v in values] if config.get("show_values", True) else None,
            textposition="outside",
            textfont=dict(size=10),
        ))
    else:
        for i, group in enumerate(groups):
            color = group.get("color", palette.chart_primary if i == 0 else palette.chart_secondary)
            values = group["values"]

            fig.add_trace(go.Bar(
                x=labels,
                y=values,
                name=group["name"],
                marker=dict(color=color, opacity=0.85, line=dict(color="white", width=0.5)),
                text=[f"${v}B" for v in values] if config.get("show_values", True) else None,
                textposition="outside",
                textfont=dict(size=10, color=[palette.green if v >= 0 else palette.red for v in values]),
            ))

    # Horizontal reference lines
    for hline in config.get("hlines", []):
        hl_color = hline.get("color", palette.gold)
        hl_style = hline.get("style", "--")
        plotly_hl_dash = "dash" if hl_style == "--" else "solid"
        fig.add_hline(
            y=hline["y"],
            line_dash=plotly_hl_dash,
            line_color=hl_color,
            line_width=1.5,
            opacity=0.7,
        )
        if hline.get("label"):
            fig.add_annotation(
                x=len(labels) - 1,
                y=hline["y"],
                text=hline["label"],
                font=dict(size=9, color=hl_color),
                showarrow=False,
                xanchor="right",
                yshift=5,
            )

    # Annotations
    for ann in config.get("annotations", []):
        ann_xy = ann.get("xy", [0, 0])
        ann_xytext = ann.get("xytext", ann_xy)
        fig.add_annotation(
            x=ann_xy[0],
            y=ann_xy[1],
            text=ann["text"],
            font=dict(size=ann.get("fontsize", 10), color=ann.get("color", palette.red)),
            showarrow=True,
            arrowcolor=ann.get("color", palette.red),
            arrowwidth=2,
            ax=ann_xytext[0] - ann_xy[0] if ann_xytext != ann_xy else 0,
            ay=ann_xytext[1] - ann_xy[1] if ann_xytext != ann_xy else -30,
            bgcolor=ann.get("box_bg", "#FFEBEE") if ann.get("box", False) else None,
            bordercolor=ann.get("color", palette.red) if ann.get("box", False) else None,
            borderwidth=1 if ann.get("box", False) else 0,
            opacity=0.95 if ann.get("box", False) else 1,
        )

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["xaxis"]["tickfont"] = dict(size=12)

    if config.get("ylabel"):
        layout["yaxis"]["title"] = dict(text=config["ylabel"], font=dict(size=11))
    if config.get("ylim"):
        layout["yaxis"]["range"] = config["ylim"]

    # Zero line
    zero_color = palette.body_text if dark else palette.navy
    fig.add_hline(y=0, line_color=zero_color, line_width=1.2)

    if n_groups > 1:
        layout["legend"] = dict(
            bgcolor="rgba(255,255,255,0.85)" if not dark else f"rgba({int(palette.chart_bg[1:3], 16)}, {int(palette.chart_bg[3:5], 16)}, {int(palette.chart_bg[5:7], 16)}, 0.85)",
            bordercolor=palette.card_border if dark else "#CCCCCC",
            borderwidth=0.5,
        )
        legend_loc = config.get("legend_loc", "upper left")
        if "right" in legend_loc:
            layout["legend"]["x"] = 1
            layout["legend"]["xanchor"] = "right"
        else:
            layout["legend"]["x"] = 0
            layout["legend"]["xanchor"] = "left"
        if "lower" in legend_loc:
            layout["legend"]["y"] = 0
            layout["legend"]["yanchor"] = "bottom"
        else:
            layout["legend"]["y"] = 1
            layout["legend"]["yanchor"] = "top"

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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

    fig = go.Figure()
    dark = _is_dark(palette)

    prefix = config.get("value_prefix", "$")
    suffix = config.get("value_suffix", "Bn")

    fig.add_trace(go.Bar(
        x=values,
        y=labels,
        orientation='h',
        marker=dict(color=colors, line=dict(color="white", width=0.5)),
        showlegend=False,
        text=[f"{prefix}{v:+.1f}{suffix}" for v in values] if config.get("show_values", True) else None,
        textposition="outside",
        textfont=dict(size=10),
    ))

    # Annotations
    for ann in config.get("annotations", []):
        ann_xy = ann.get("xy", [0, 0])
        ann_xytext = ann.get("xytext", ann_xy)
        fig.add_annotation(
            x=ann_xy[0],
            y=ann_xy[1],
            text=ann["text"],
            font=dict(size=9, color=ann.get("color", palette.red)),
            showarrow=True,
            arrowcolor=ann.get("color", palette.red),
            arrowwidth=1.5,
            ax=ann_xytext[0] - ann_xy[0] if ann_xytext != ann_xy else 30,
            ay=ann_xytext[1] - ann_xy[1] if ann_xytext != ann_xy else 0,
            bgcolor=ann.get("box_bg", "#FFEBEE") if ann.get("box", False) else None,
            bordercolor=ann.get("color", palette.red) if ann.get("box", False) else None,
            borderwidth=1 if ann.get("box", False) else 0,
            opacity=0.9 if ann.get("box", False) else 1,
        )

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["yaxis"]["tickfont"] = dict(size=11)

    if config.get("xlabel"):
        layout["xaxis"]["title"] = dict(text=config["xlabel"], font=dict(size=11))

    # Zero line
    hbar_zero = palette.body_text if dark else palette.navy
    fig.add_vline(x=0, line_color=hbar_zero, line_width=1.2)

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    labels = data["labels"]
    stacks = data["stacks"]

    fig = go.Figure()
    dark = _is_dark(palette)

    default_colors = [palette.chart_primary, palette.chart_secondary, palette.green,
                      palette.orange, palette.gray] + (palette.extra_colors if hasattr(palette, 'extra_colors') else [])

    for i, stack in enumerate(stacks):
        color = stack.get("color", default_colors[i % len(default_colors)])
        fig.add_trace(go.Bar(
            x=labels,
            y=stack["values"],
            name=stack["name"],
            marker=dict(color=color, line=dict(color="white", width=0.3)),
        ))

    # Show totals above bars
    if config.get("show_totals", True):
        totals = [sum(stack["values"][i] for stack in stacks) for i in range(len(labels))]
        prefix = config.get("total_prefix", "€")
        suffix = config.get("total_suffix", "B")
        total_text_color = palette.body_text if dark else palette.navy

        for i, (label, total) in enumerate(zip(labels, totals)):
            fig.add_annotation(
                x=label,
                y=total,
                text=f"{prefix}{int(total)}{suffix}",
                font=dict(size=9, color=total_text_color),
                showarrow=False,
                yshift=10,
            )

    # Annotations
    for ann in config.get("annotations", []):
        ann_xy = ann.get("xy", [0, 0])
        ann_xytext = ann.get("xytext", ann_xy)
        fig.add_annotation(
            x=ann_xy[0],
            y=ann_xy[1],
            text=ann["text"],
            font=dict(size=9, color=ann.get("color", palette.navy)),
            showarrow=True,
            arrowcolor=ann.get("color", palette.navy),
            arrowwidth=1.5,
            ax=ann_xytext[0] - ann_xy[0] if ann_xytext != ann_xy else 0,
            ay=ann_xytext[1] - ann_xy[1] if ann_xytext != ann_xy else -30,
            bgcolor=ann.get("box_bg", "#E3F2FD") if ann.get("box", False) else None,
            bordercolor=ann.get("color", palette.navy) if ann.get("box", False) else None,
            borderwidth=1 if ann.get("box", False) else 0,
            opacity=0.9 if ann.get("box", False) else 1,
        )

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["barmode"] = "stack"
    layout["xaxis"]["tickfont"] = dict(size=10)

    if config.get("ylabel"):
        layout["yaxis"]["title"] = dict(text=config["ylabel"], font=dict(size=11))
    if config.get("ylim"):
        layout["yaxis"]["range"] = config["ylim"]

    layout["legend"] = dict(
        bgcolor="rgba(255,255,255,0.85)" if not dark else f"rgba({int(palette.chart_bg[1:3], 16)}, {int(palette.chart_bg[3:5], 16)}, {int(palette.chart_bg[5:7], 16)}, 0.85)",
        bordercolor=palette.card_border if dark else "#CCCCCC",
        borderwidth=0.5,
        orientation="h",
        x=0.5,
        y=1.1,
        xanchor="center",
        yanchor="bottom",
    )
    legend_loc = config.get("legend_loc", "upper left")
    if "right" in legend_loc:
        layout["legend"]["x"] = 1
        layout["legend"]["xanchor"] = "right"
        layout["legend"]["orientation"] = "v"
        layout["legend"]["y"] = 1
    elif "upper" in legend_loc:
        layout["legend"]["x"] = 0
        layout["legend"]["xanchor"] = "left"
        layout["legend"]["y"] = 1
        layout["legend"]["yanchor"] = "top"
        layout["legend"]["orientation"] = "v"

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    headers = data["headers"]
    rows = data["rows"]
    separators = set(data.get("separators", []))

    color_cols = set(config.get("color_cols", list(range(3, len(headers)))))
    signal_col = config.get("signal_col", len(headers) - 1)

    dark = _is_dark(palette)
    cell_bg = palette.chart_bg if dark else palette.white

    def val_color(val_str, is_signal=False):
        if dark:
            if is_signal:
                if val_str == "Overbought":
                    return "#2D2010"
                elif val_str == "Oversold":
                    return "#102030"
                return cell_bg
            if not val_str or val_str == "—":
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
            if not val_str or val_str == "—":
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
        if not val_str or val_str == "—":
            return palette.body_text
        if val_str.startswith("+"):
            return palette.green
        elif val_str.startswith("-"):
            return palette.red
        return palette.body_text

    # Build cell fill colors and font colors
    fill_colors = [[palette.navy] * len(headers)]  # Header row
    font_colors = [[palette.white] * len(headers)]  # Header row

    for i, row in enumerate(rows):
        if i in separators or (len(row) > 0 and row[0] == ""):
            # Separator row — skip for now (Plotly tables don't have separator lines easily)
            row_fill = [cell_bg] * len(row)
            row_font = [palette.body_text] * len(row)
        else:
            row_fill = []
            row_font = []
            for j, cell in enumerate(row):
                is_sig = (j == signal_col)
                bg = val_color(cell, is_sig) if j in color_cols else cell_bg
                fc = text_color(cell, is_sig) if j in color_cols else palette.body_text
                row_fill.append(bg)
                row_font.append(fc)
        fill_colors.append(row_fill)
        font_colors.append(row_font)

    # Transpose for Plotly (columns, not rows)
    all_rows = [headers] + rows
    columns = [[all_rows[i][j] for i in range(len(all_rows))] for j in range(len(headers))]
    fill_colors_cols = [[fill_colors[i][j] for i in range(len(all_rows))] for j in range(len(headers))]
    font_colors_cols = [[font_colors[i][j] for i in range(len(all_rows))] for j in range(len(headers))]

    fig = go.Figure()

    fig.add_trace(go.Table(
        header=dict(
            values=[""] * len(headers),  # Empty because we include header in cells
            fill_color="rgba(0,0,0,0)",
            line_color="rgba(0,0,0,0)",
            height=0,
        ),
        cells=dict(
            values=columns,
            fill_color=fill_colors_cols,
            font=dict(color=font_colors_cols, size=9, family="Arial"),
            align=["left"] + ["center"] * (len(headers) - 1),
            height=30,
            line_color="#EEEEEE" if not dark else "#1E2D42",
        ),
    ))

    # Plotly tables auto-size from top and don't stretch to fill.
    # Compute a tight export height so PNG has no blank space below.
    # Empirical: at width=3333, each row renders at ~45px in the output PNG.
    n_total = len(rows) + 1  # header + data
    source_px = 60 if source else 0
    export_height = max(200, n_total * 45 + source_px + 40)

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.fig_bg,
        margin=dict(l=10, r=10, t=10, b=70 if source else 10),
    )

    if source:
        layout["annotations"] = [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=export_height)
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
    value = data["value"]
    max_val = data.get("max_value", 10)
    zones = data.get("zones", [])

    # Build gauge steps from zones
    steps = []
    for zone in zones:
        steps.append(dict(
            range=[zone["start"], zone["end"]],
            color=zone.get("color", "#F5F5F5"),
        ))

    fig = go.Figure()

    fig.add_trace(go.Indicator(
        mode="gauge+number",
        value=value,
        domain=dict(x=[0.1, 0.9], y=[0.3, 0.7]),
        number=dict(font=dict(size=36, color=palette.red)),
        gauge=dict(
            axis=dict(range=[0, max_val], tickwidth=1, tickcolor=palette.gray),
            bar=dict(color=palette.red, thickness=0.3),
            bgcolor="rgba(0,0,0,0)",
            borderwidth=0,
            steps=steps,
            threshold=dict(
                line=dict(color=palette.red, width=4),
                thickness=0.8,
                value=value,
            ),
        ),
    ))

    # Context boxes as annotations
    annotations = []
    for box in config.get("context_boxes", []):
        annotations.append(dict(
            x=box.get("x", 0.3),
            y=box.get("y", 0.1),
            xref="paper",
            yref="paper",
            text=box["text"],
            font=dict(size=9, color=palette.navy),
            showarrow=False,
            bgcolor=box.get("bg_color", "#F5F5F5"),
            bordercolor=box.get("border_color", palette.gray),
            borderwidth=1,
            opacity=0.9,
        ))

    if source:
        annotations.append(_source_annotation(source, palette))

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.fig_bg,
        margin=dict(l=20, r=20, t=80, b=60),
        annotations=annotations,
    )

    if config.get("title"):
        gauge_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
        layout["title"] = dict(
            text=config["title"],
            font=dict(size=18, color=gauge_title_color),
            x=0.5,
            xanchor="center",
        )

    if config.get("subtitle"):
        layout["annotations"].insert(0, dict(
            x=0.5,
            y=0.85,
            xref="paper",
            yref="paper",
            text=config["subtitle"],
            font=dict(size=12, color=palette.red),
            showarrow=False,
        ))

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    donut = data.get("donut", {})
    matrix = data.get("matrix", {})

    dark = _is_dark(palette)

    # Create subplots: left = donut (pie), right = table
    fig = make_subplots(
        rows=1, cols=2,
        specs=[[{"type": "domain"}, {"type": "table"}]],
        column_widths=[0.45, 0.55],
        horizontal_spacing=0.05,
    )

    # LEFT: Donut
    labels = donut.get("labels", [])
    sizes = donut.get("sizes", [])
    default_colors = [palette.chart_primary, palette.chart_secondary, "#5B9BD5",
                      palette.green, palette.orange, palette.gold, palette.gray]
    colors_pie = donut.get("colors", default_colors[:len(sizes)])

    fig.add_trace(go.Pie(
        labels=labels,
        values=sizes,
        marker=dict(colors=colors_pie, line=dict(color=palette.fig_bg if dark else palette.white, width=2)),
        hole=0.6,
        textposition="outside",
        textfont=dict(size=8),
    ), row=1, col=1)

    # RIGHT: Conviction matrix
    matrix_headers = matrix.get("headers", [])
    matrix_rows = matrix.get("rows", [])

    # Build cell colors
    cell_bg_default = palette.chart_bg if dark else palette.white

    fill_colors = [[palette.navy] * len(matrix_headers)]  # Header
    font_colors = [[palette.white] * len(matrix_headers)]  # Header

    for row in matrix_rows:
        view = row[1] if len(row) > 1 else ""
        if dark:
            bg = "#0D2D10" if view == "OW" else ("#2D0D10" if view == "UW" else cell_bg_default)
        else:
            bg = "#E8F5E9" if view == "OW" else ("#FFEBEE" if view == "UW" else palette.white)

        row_fill = [bg] * len(row)
        row_font = []
        for j, cell in enumerate(row):
            if j == 1:
                tc = palette.green if view == "OW" else (palette.red if view == "UW" else palette.gray)
            elif j == 2:
                if "↑" in cell:
                    tc = palette.green
                elif "↓" in cell:
                    tc = palette.red
                else:
                    tc = palette.gray
            else:
                tc = palette.body_text
            row_font.append(tc)

        fill_colors.append(row_fill)
        font_colors.append(row_font)

    # Transpose
    all_rows = [matrix_headers] + matrix_rows
    columns = [[all_rows[i][j] for i in range(len(all_rows))] for j in range(len(matrix_headers))]
    fill_colors_cols = [[fill_colors[i][j] for i in range(len(all_rows))] for j in range(len(matrix_headers))]
    font_colors_cols = [[font_colors[i][j] for i in range(len(all_rows))] for j in range(len(matrix_headers))]

    fig.add_trace(go.Table(
        header=dict(
            values=[""] * len(matrix_headers),
            fill_color="rgba(0,0,0,0)",
            height=0,
        ),
        cells=dict(
            values=columns,
            fill_color=fill_colors_cols,
            font=dict(color=font_colors_cols, size=8, family="Arial"),
            align=["left", "center", "center", "left"],
            height=25,
            line_color="#EEEEEE" if not dark else "#1E2D42",
        ),
    ), row=1, col=2)

    # Annotations for center text and titles
    annotations = []

    donut_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
    center_text = donut.get("center_text", "")
    if center_text:
        annotations.append(dict(
            x=0.225,
            y=0.5,
            xref="paper",
            yref="paper",
            text=center_text,
            font=dict(size=10, color=donut_title_color),
            showarrow=False,
        ))

    if config.get("donut_title"):
        annotations.append(dict(
            x=0.225,
            y=0.95,
            xref="paper",
            yref="paper",
            text=config["donut_title"],
            font=dict(size=12, color=donut_title_color),
            showarrow=False,
        ))

    matrix_title_color = palette.title_color if hasattr(palette, 'title_color') else palette.navy
    if config.get("matrix_title"):
        annotations.append(dict(
            x=0.725,
            y=0.95,
            xref="paper",
            yref="paper",
            text=config["matrix_title"],
            font=dict(size=12, color=matrix_title_color),
            showarrow=False,
        ))

    if source:
        annotations.append(_source_annotation(source, palette))

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.fig_bg,
        margin=dict(l=20, r=20, t=80, b=60),
        annotations=annotations,
        showlegend=False,
    )

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    labels = data["labels"]
    values = data["values"]
    is_total = data.get("is_total", [i == 0 or i == len(values) - 1 for i in range(len(values))])

    # Build measure types for Plotly waterfall
    measure = []
    for i, total in enumerate(is_total):
        if total:
            measure.append("absolute")
        elif values[i] >= 0:
            measure.append("relative")
        else:
            measure.append("relative")

    # Adjust text to show sign for relative values
    text_values = []
    for v, total in zip(values, is_total):
        if total:
            text_values.append(f"{v}{config.get('value_suffix', '')}")
        else:
            prefix = "+" if v > 0 else ""
            text_values.append(f"{prefix}{v}{config.get('value_suffix', '')}")

    dark = _is_dark(palette)

    fig = go.Figure()

    fig.add_trace(go.Waterfall(
        x=labels,
        y=values,
        measure=measure,
        text=text_values,
        textposition="outside",
        textfont=dict(size=10),
        connector=dict(line=dict(color=palette.body_text if dark else "#AAAAAA", width=0.8, dash="dash")) if config.get("show_connectors", True) else dict(visible=False),
        increasing=dict(marker=dict(color=palette.green)),
        decreasing=dict(marker=dict(color=palette.red)),
        totals=dict(marker=dict(color=palette.chart_primary)),
    ))

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["xaxis"]["tickfont"] = dict(size=11)

    if config.get("ylabel"):
        layout["yaxis"]["title"] = dict(text=config["ylabel"], font=dict(size=11))

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    years = data["years"]
    assets = data["assets"]
    returns = np.array(data["returns"])  # shape: (n_years, n_assets)

    n_years = len(years)
    n_assets = len(assets)

    dark = _is_dark(palette)
    color_mode = config.get("color_mode", "gradient")

    # Build sorted matrix (each year sorted by return, best at top)
    sorted_returns = []
    sorted_assets = []

    for yi in range(n_years):
        col = returns[yi]
        sorted_indices = np.argsort(col)[::-1]
        year_returns = [col[ai] for ai in sorted_indices]
        year_assets = [assets[ai] for ai in sorted_indices]
        sorted_returns.append(year_returns)
        sorted_assets.append(year_assets)

    # Flatten for heatmap
    z_matrix = np.array(sorted_returns).T  # Transpose to (assets, years)

    # Text annotations
    text_matrix = []
    for rank in range(n_assets):
        row_text = []
        for yi in range(n_years):
            asset_name = sorted_assets[yi][rank]
            val = sorted_returns[yi][rank]
            row_text.append(f"{asset_name}<br>{val:+.1f}%")
        text_matrix.append(row_text)

    # Color scale
    if color_mode == "categorical":
        # Use discrete colors per asset
        cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
            palette.chart_primary, palette.chart_secondary, palette.green,
            palette.red, palette.orange, palette.gray
        ]
        # For categorical mode, we'd need to map each cell to its asset color
        # This is complex in Plotly heatmap — simplify to gradient for now
        # (Categorical mode would require custom shapes, which is beyond scope)
        color_mode = "gradient"

    # Gradient colorscale
    if dark:
        colorscale = [[0, "#1A3A5C"], [0.5, "#1E2D42"], [1, "#1B4332"]]
    else:
        colorscale = [[0, "#D4E6F1"], [0.5, "#FFFFFF"], [1, "#C8E6C9"]]

    fig = go.Figure()

    fig.add_trace(go.Heatmap(
        z=z_matrix,
        x=years,
        y=list(range(n_assets)),
        text=text_matrix,
        texttemplate="%{text}",
        textfont=dict(size=7, color=palette.body_text),
        colorscale=colorscale,
        showscale=False,
        hoverinfo="text",
    ))

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.fig_bg,
        xaxis=dict(
            tickmode="array",
            tickvals=list(range(n_years)),
            ticktext=years,
            tickfont=dict(size=9),
            side="bottom",
            showgrid=False,
            showline=False,
        ),
        yaxis=dict(
            showticklabels=False,
            showgrid=False,
            showline=False,
        ),
        margin=dict(l=20, r=20, t=80, b=60),
    )

    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    annotations = []
    if source:
        annotations.append(_source_annotation(source, palette))

    if annotations:
        layout["annotations"] = annotations

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=2000)
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
    points = data.get("points", [])
    dark = _is_dark(palette)

    fig = go.Figure()

    # Scatter points
    xs = [pt["x"] for pt in points]
    ys = [pt["y"] for pt in points]
    sizes = [pt.get("size", 80) for pt in points]
    colors = [pt.get("color", palette.chart_primary) for pt in points]
    labels = [pt.get("label", "") for pt in points]

    fig.add_trace(go.Scatter(
        x=xs,
        y=ys,
        mode='markers+text',
        marker=dict(size=[s/4 for s in sizes], color=colors, opacity=0.8, line=dict(color="white", width=0.5)),
        text=labels,
        textposition="top right",
        textfont=dict(size=7, color=palette.body_text),
    ))

    # Quadrant lines and labels
    ql = data.get("quadrant_labels")
    if ql:
        mid_x = (min(xs) + max(xs)) / 2
        mid_y = (min(ys) + max(ys)) / 2
        q_color = palette.light_gray if not dark else "#1E2D42"

        fig.add_hline(y=mid_y, line_dash="dash", line_color=q_color, line_width=0.8, opacity=0.6)
        fig.add_vline(x=mid_x, line_dash="dash", line_color=q_color, line_width=0.8, opacity=0.6)

        # Quadrant labels as annotations
        annotations = []
        if ql.get("tl"):
            annotations.append(dict(x=min(xs), y=max(ys), text=ql["tl"], font=dict(size=8, color=palette.gray),
                                   showarrow=False, xanchor="left", yanchor="top", opacity=0.5))
        if ql.get("tr"):
            annotations.append(dict(x=max(xs), y=max(ys), text=ql["tr"], font=dict(size=8, color=palette.gray),
                                   showarrow=False, xanchor="right", yanchor="top", opacity=0.5))
        if ql.get("bl"):
            annotations.append(dict(x=min(xs), y=min(ys), text=ql["bl"], font=dict(size=8, color=palette.gray),
                                   showarrow=False, xanchor="left", yanchor="bottom", opacity=0.5))
        if ql.get("br"):
            annotations.append(dict(x=max(xs), y=min(ys), text=ql["br"], font=dict(size=8, color=palette.gray),
                                   showarrow=False, xanchor="right", yanchor="bottom", opacity=0.5))

    # Trend line (linear regression)
    if data.get("trend_line") and len(points) >= 2:
        xs_arr = np.array(xs)
        ys_arr = np.array(ys)
        z = np.polyfit(xs_arr, ys_arr, 1)
        p = np.poly1d(z)
        x_line = np.linspace(xs_arr.min(), xs_arr.max(), 100)
        fig.add_trace(go.Scatter(
            x=x_line,
            y=p(x_line),
            mode='lines',
            line=dict(color=palette.red, width=1.5, dash="dash"),
            opacity=0.6,
            showlegend=False,
            hoverinfo='skip',
        ))

    # Apply layout
    layout = _institutional_layout(palette, config)

    if data.get("x_label"):
        layout["xaxis"]["title"] = dict(text=data["x_label"], font=dict(size=11))
    if data.get("y_label"):
        layout["yaxis"]["title"] = dict(text=data["y_label"], font=dict(size=11))
    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    if ql:
        layout["annotations"] = layout.get("annotations", []) + annotations

    fig.update_layout(**layout)
    fig.write_image(output_path, width=2500, height=1750)
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
    rows = data.get("rows", [])
    headers = data.get("headers", [])
    n_rows = len(rows)
    n_cols = len(headers)

    dark = _is_dark(palette)

    # Create subplots: n_cols text columns + 1 sparkline column
    fig = make_subplots(
        rows=n_rows + 1,
        cols=n_cols + 1,
        specs=[[{"type": "xy"}] * (n_cols + 1) for _ in range(n_rows + 1)],
        vertical_spacing=0.01,
        horizontal_spacing=0.01,
    )

    # Header row
    for j, h in enumerate(headers):
        fig.add_trace(go.Scatter(
            x=[0], y=[0],
            mode='text',
            text=[h],
            textfont=dict(size=9, color=palette.white),
            showlegend=False,
            hoverinfo='skip',
        ), row=1, col=j+1)
        fig.update_xaxes(visible=False, row=1, col=j+1)
        fig.update_yaxes(visible=False, row=1, col=j+1)

    # Sparkline header
    fig.add_trace(go.Scatter(
        x=[0], y=[0],
        mode='text',
        text=["Trend"],
        textfont=dict(size=9, color=palette.white),
        showlegend=False,
        hoverinfo='skip',
    ), row=1, col=n_cols+1)
    fig.update_xaxes(visible=False, row=1, col=n_cols+1)
    fig.update_yaxes(visible=False, row=1, col=n_cols+1)

    # Data rows
    for i, row in enumerate(rows):
        cells = row.get("cells", [])
        sparkline_data = row.get("sparkline", [])

        for j in range(n_cols):
            cell_text = cells[j] if j < len(cells) else ""
            tc = palette.body_text
            if cell_text.startswith("+"):
                tc = palette.green
            elif cell_text.startswith("-"):
                tc = palette.red

            fig.add_trace(go.Scatter(
                x=[0], y=[0],
                mode='text',
                text=[cell_text],
                textfont=dict(size=8, color=tc),
                showlegend=False,
                hoverinfo='skip',
            ), row=i+2, col=j+1)
            fig.update_xaxes(visible=False, row=i+2, col=j+1)
            fig.update_yaxes(visible=False, row=i+2, col=j+1)

        # Sparkline
        if sparkline_data and len(sparkline_data) >= 2:
            trend_up = sparkline_data[-1] >= sparkline_data[0]
            spark_color = palette.green if trend_up else palette.red
            fig.add_trace(go.Scatter(
                x=list(range(len(sparkline_data))),
                y=sparkline_data,
                mode='lines',
                line=dict(color=spark_color, width=1.2),
                fill='tozeroy',
                fillcolor=f"rgba({int(spark_color[1:3], 16)}, {int(spark_color[3:5], 16)}, {int(spark_color[5:7], 16)}, 0.15)",
                showlegend=False,
                hoverinfo='skip',
            ), row=i+2, col=n_cols+1)
            fig.update_xaxes(visible=False, row=i+2, col=n_cols+1)
            fig.update_yaxes(visible=False, row=i+2, col=n_cols+1)

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.fig_bg,
        margin=dict(l=20, r=20, t=40, b=60),
        showlegend=False,
        height=max(600, n_rows * 50 + 100),
    )

    if source:
        layout["annotations"] = [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=max(1375, n_rows * 125 + 275))
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
    categories = data["categories"]
    values = np.array(data["values"], dtype=float)

    if config.get("sort", False):
        order = np.argsort(values)
        categories = [categories[i] for i in order]
        values = values[order]

    colors = [palette.green if v >= 0 else palette.red for v in values]

    fig = go.Figure()

    # Add stems as shapes
    for i, (cat, val, color) in enumerate(zip(categories, values, colors)):
        fig.add_shape(
            type="line",
            x0=0, x1=val,
            y0=i, y1=i,
            line=dict(color=color, width=1.5),
        )

    # Add dots
    fig.add_trace(go.Scatter(
        x=values,
        y=list(range(len(categories))),
        mode='markers',
        marker=dict(size=8, color=colors, line=dict(color="white", width=0.5)),
        showlegend=False,
    ))

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["yaxis"]["tickmode"] = "array"
    layout["yaxis"]["tickvals"] = list(range(len(categories)))
    layout["yaxis"]["ticktext"] = categories
    layout["yaxis"]["tickfont"] = dict(size=10)

    # Zero line
    fig.add_vline(x=0, line_color=palette.gray, line_width=0.8)

    if config.get("xlabel"):
        layout["xaxis"]["title"] = dict(text=config["xlabel"], font=dict(size=11))
    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3000, height=1500)
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
    categories = data["categories"]
    start_vals = np.array(data["start"], dtype=float)
    end_vals = np.array(data["end"], dtype=float)
    start_label = data.get("start_label", "Start")
    end_label = data.get("end_label", "End")

    fig = go.Figure()

    # Add connector lines as shapes
    for i, (s, e) in enumerate(zip(start_vals, end_vals)):
        fig.add_shape(
            type="line",
            x0=min(s, e), x1=max(s, e),
            y0=i, y1=i,
            line=dict(color=palette.light_gray, width=2.5),
        )

    # Start dots
    fig.add_trace(go.Scatter(
        x=start_vals,
        y=list(range(len(categories))),
        mode='markers',
        name=start_label,
        marker=dict(size=10, color=palette.gray, line=dict(color="white", width=1)),
    ))

    # End dots
    fig.add_trace(go.Scatter(
        x=end_vals,
        y=list(range(len(categories))),
        mode='markers',
        name=end_label,
        marker=dict(size=10, color=palette.chart_primary, line=dict(color="white", width=1)),
    ))

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["yaxis"]["tickmode"] = "array"
    layout["yaxis"]["tickvals"] = list(range(len(categories)))
    layout["yaxis"]["ticktext"] = categories
    layout["yaxis"]["tickfont"] = dict(size=10)

    layout["legend"] = dict(
        x=1,
        y=0,
        xanchor="right",
        yanchor="bottom",
        font=dict(size=9),
    )

    if config.get("xlabel"):
        layout["xaxis"]["title"] = dict(text=config["xlabel"], font=dict(size=11))
    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3000, height=1500)
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
    labels = data["labels"]
    series_list = data["series"]
    x = list(range(len(labels)))

    fig = go.Figure()

    cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
        palette.chart_primary, palette.chart_secondary, palette.green
    ]

    if config.get("stacked", False) and len(series_list) > 1:
        for i, s in enumerate(series_list):
            color = s.get("color", cycle[i % len(cycle)])
            fig.add_trace(go.Scatter(
                x=x,
                y=s["values"],
                mode='lines',
                name=s["name"],
                line=dict(color=color, width=0),
                fill='tonexty' if i > 0 else 'tozeroy',
                fillcolor=f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.7)",
                stackgroup='one',
            ))
    else:
        for i, s in enumerate(series_list):
            color = s.get("color", cycle[i % len(cycle)])
            fig.add_trace(go.Scatter(
                x=x,
                y=s["values"],
                mode='lines',
                name=s["name"],
                line=dict(color=color, width=2),
                fill='tozeroy',
                fillcolor=f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.3)",
            ))

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["xaxis"]["tickmode"] = "array"
    layout["xaxis"]["tickvals"] = x
    layout["xaxis"]["ticktext"] = labels
    layout["xaxis"]["tickfont"] = dict(size=9)

    if config.get("ylabel"):
        layout["yaxis"]["title"] = dict(text=config["ylabel"], font=dict(size=11))
    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    if len(series_list) > 1:
        layout["legend"] = dict(x=0, y=1, xanchor="left", yanchor="top", font=dict(size=9))

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1375)
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
    periods = data["periods"]
    series_list = data["series"]
    x = list(range(len(periods)))

    fig = go.Figure()

    cycle = palette.series_cycle if hasattr(palette, 'series_cycle') else [
        palette.chart_primary, palette.chart_secondary, palette.green, palette.red
    ]

    for i, s in enumerate(series_list):
        color = s.get("color", cycle[i % len(cycle)])
        lw = max(1.5, 3.5 - i * 0.3)

        fig.add_trace(go.Scatter(
            x=x,
            y=s["ranks"],
            mode='lines+markers',
            name=s["name"],
            line=dict(color=color, width=lw),
            marker=dict(size=8, color=color),
        ))

        # Labels at left and right
        fig.add_annotation(
            x=-0.3,
            y=s["ranks"][0],
            text=s["name"],
            font=dict(size=8, color=color),
            showarrow=False,
            xanchor="right",
        )
        fig.add_annotation(
            x=len(periods) - 1 + 0.3,
            y=s["ranks"][-1],
            text=s["name"],
            font=dict(size=8, color=color),
            showarrow=False,
            xanchor="left",
        )

    # Apply layout
    layout = _institutional_layout(palette, config)
    layout["xaxis"]["tickmode"] = "array"
    layout["xaxis"]["tickvals"] = x
    layout["xaxis"]["ticktext"] = periods
    layout["xaxis"]["tickfont"] = dict(size=10)

    # Invert Y axis (rank 1 = top)
    layout["yaxis"]["autorange"] = "reversed"
    layout["yaxis"]["title"] = dict(text="Rank", font=dict(size=11))
    max_rank = max(r for s in series_list for r in s["ranks"])
    layout["yaxis"]["tickmode"] = "array"
    layout["yaxis"]["tickvals"] = list(range(1, max_rank + 1))

    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14))

    layout["showlegend"] = False

    if source:
        layout["annotations"] = layout.get("annotations", []) + [_source_annotation(source, palette)]

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=1500)
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
    panels = data["panels"]
    n = len(panels)
    ncols = config.get("ncols", min(4, n))
    nrows = (n + ncols - 1) // ncols

    chart_type = config.get("chart_type", "line")

    # Create subplots
    fig = make_subplots(
        rows=nrows,
        cols=ncols,
        subplot_titles=[p.get("title", "") for p in panels],
        vertical_spacing=0.1,
        horizontal_spacing=0.08,
    )

    # Determine Y limits (shared only when ranges comparable)
    shared_y = config.get("shared_y", None)
    all_vals = [v for p in panels for v in p.get("values", [])]

    if all_vals and shared_y is not False:
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
            shared_min = min(all_vals)
            shared_max = max(all_vals)
            margin = (shared_max - shared_min) * 0.1 or 1
            global_ylim = (shared_min - margin, shared_max + margin)
            use_shared_y = True
        else:
            use_shared_y = False
    else:
        use_shared_y = False

    for idx, panel in enumerate(panels):
        row = idx // ncols + 1
        col = idx % ncols + 1

        labels = panel.get("labels", [])
        values = panel.get("values", [])
        x = list(range(len(labels)))

        if chart_type == "bar":
            colors = [palette.green if v >= 0 else palette.red for v in values]
            fig.add_trace(go.Bar(
                x=labels,
                y=values,
                marker=dict(color=colors, line=dict(color="white", width=0.3)),
                showlegend=False,
            ), row=row, col=col)
        else:
            fig.add_trace(go.Scatter(
                x=x,
                y=values,
                mode='lines',
                line=dict(color=palette.chart_primary, width=1.5),
                fill='tozeroy',
                fillcolor=f"rgba({int(palette.chart_primary[1:3], 16)}, {int(palette.chart_primary[3:5], 16)}, {int(palette.chart_primary[5:7], 16)}, 0.15)",
                showlegend=False,
            ), row=row, col=col)

            fig.update_xaxes(tickmode="array", tickvals=x, ticktext=labels, tickfont=dict(size=6), row=row, col=col)

        if use_shared_y:
            fig.update_yaxes(range=global_ylim, row=row, col=col)

        fig.update_xaxes(tickfont=dict(size=6), row=row, col=col)
        fig.update_yaxes(tickfont=dict(size=6), row=row, col=col)

    layout = dict(
        paper_bgcolor=palette.fig_bg,
        plot_bgcolor=palette.chart_bg,
        margin=dict(l=40, r=40, t=80, b=50),
        showlegend=False,
        height=max(600, nrows * 250),
    )

    if config.get("title"):
        layout["title"] = dict(text=config["title"], font=dict(size=14), x=0.5, xanchor="center")

    annotations = []
    if source:
        annotations.append(_source_annotation(source, palette))

    if annotations:
        layout["annotations"] = layout.get("annotations", []) + annotations

    fig.update_layout(**layout)
    fig.write_image(output_path, width=3333, height=max(1375, nrows * 625))
    return output_path
