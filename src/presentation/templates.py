"""
Genesis Presentation Engine — Slide Templates

Parameterized slide builders for PPTX generation.
Each function receives content from JSON spec and palette from design.py.
"""

from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from design import rgb


# ============================================================================
# Reusable Slide Furniture
# ============================================================================

def add_header_bar(slide, palette, meta: dict):
    """Navy bar at top with branding."""
    slide_w = Inches(meta.get("slide_width", 13.333))

    bar = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), slide_w, Inches(0.5)
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = rgb(palette.navy)
    bar.line.fill.background()

    # Left: tag text
    tf = bar.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = "   " + meta.get("header_tag", "#WEEKLY STRATEGY")
    run.font.size = Pt(10)
    run.font.bold = True
    run.font.color.rgb = rgb(palette.gold)

    # Center: company name
    center_box = slide.shapes.add_textbox(
        Inches(4.5), Inches(0), Inches(4.333), Inches(0.5)
    )
    tf2 = center_box.text_frame
    tf2.word_wrap = False
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    p2.space_before = Pt(6)
    run2 = p2.add_run()
    run2.text = meta.get("company", "Crossinvest SA")
    run2.font.size = Pt(11)
    run2.font.bold = True
    run2.font.color.rgb = rgb(palette.white)

    # Right: date
    right_box = slide.shapes.add_textbox(
        Inches(10), Inches(0), Inches(3.0), Inches(0.5)
    )
    tf3 = right_box.text_frame
    tf3.word_wrap = False
    p3 = tf3.paragraphs[0]
    p3.alignment = PP_ALIGN.RIGHT
    p3.space_before = Pt(6)
    run3 = p3.add_run()
    run3.text = meta.get("date", "") + "   "
    run3.font.size = Pt(10)
    run3.font.color.rgb = rgb(palette.white)


def add_section_line(slide, palette):
    """Short accent line below header."""
    line = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(0.58), Inches(1.2), Pt(3)
    )
    line.fill.solid()
    line.fill.fore_color.rgb = rgb(palette.navy)
    line.line.fill.background()


def add_footer(slide, palette, meta: dict, page_num: int):
    """Footer with page number."""
    slide_w_in = meta.get("slide_width", 13.333)

    # Thin gray line
    line_width = slide_w_in - 1.2
    line = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(7.0), Inches(line_width), Pt(1)
    )
    line.fill.solid()
    line.fill.fore_color.rgb = rgb(palette.light_gray)
    line.line.fill.background()

    # Left: branding
    lb = slide.shapes.add_textbox(Inches(0.6), Inches(7.05), Inches(4), Inches(0.35))
    tf = lb.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = meta.get("footer_left", "CROSSINVEST SA | Lugano")
    run.font.size = Pt(8)
    run.font.bold = True
    run.font.color.rgb = rgb(palette.gold)

    # Center: confidential
    cb = slide.shapes.add_textbox(Inches(4.5), Inches(7.05), Inches(4.333), Inches(0.35))
    tf2 = cb.text_frame
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    r2 = p2.add_run()
    r2.text = meta.get("footer_center", "Strictly Confidential")
    r2.font.size = Pt(8)
    r2.font.italic = True
    r2.font.color.rgb = rgb(palette.source_color)

    # Right: page number
    rb = slide.shapes.add_textbox(Inches(10), Inches(7.05), Inches(2.733), Inches(0.35))
    tf3 = rb.text_frame
    p3 = tf3.paragraphs[0]
    p3.alignment = PP_ALIGN.RIGHT
    r3 = p3.add_run()
    r3.text = f"Page {page_num}"
    r3.font.size = Pt(8)
    r3.font.color.rgb = rgb(palette.source_color)


def add_slide_title(slide, title: str, subtitle: str = None, tag: str = None, palette=None):
    """Assertion-evidence title block."""
    tb = slide.shapes.add_textbox(Inches(0.6), Inches(0.7), Inches(11.5), Inches(0.8))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = title
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = rgb(palette.navy)
    run.font.name = "Arial"

    if subtitle:
        tb2 = slide.shapes.add_textbox(Inches(0.6), Inches(1.45), Inches(11.5), Inches(0.5))
        tf2 = tb2.text_frame
        tf2.word_wrap = True
        p2 = tf2.paragraphs[0]
        r2 = p2.add_run()
        r2.text = subtitle
        r2.font.size = Pt(12)
        r2.font.color.rgb = rgb(palette.body_text)

    if tag:
        tb3 = slide.shapes.add_textbox(Inches(0.6), Inches(1.95), Inches(4), Inches(0.3))
        tf3 = tb3.text_frame
        p3 = tf3.paragraphs[0]
        r3 = p3.add_run()
        r3.text = tag
        r3.font.size = Pt(11)
        r3.font.bold = True
        r3.font.color.rgb = rgb(palette.orange)


def add_chart_tag(slide, chart_num: int, left: float = 0.4, top: float = 2.15, palette=None):
    """Orange chart number badge."""
    tag_shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top),
        Inches(0.9), Inches(0.28)
    )
    tag_shape.fill.solid()
    tag_shape.fill.fore_color.rgb = rgb(palette.orange)
    tag_shape.line.fill.background()
    tf = tag_shape.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = f"Chart #{chart_num}"
    run.font.size = Pt(9)
    run.font.bold = True
    run.font.color.rgb = rgb(palette.white)


def add_chart_image(slide, img_path: str, left: float = 0.4, top: float = 2.5,
                    width: float = 12.5, height: float = 4.5):
    """Place a chart image on the slide."""
    slide.shapes.add_picture(
        img_path, Inches(left), Inches(top), Inches(width), Inches(height)
    )


def make_content_slide(prs, palette, meta: dict, page_num: int):
    """Create blank slide with header, section line, footer."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank layout
    add_header_bar(slide, palette, meta)
    add_section_line(slide, palette)
    add_footer(slide, palette, meta, page_num)
    return slide


# ============================================================================
# Slide Builders
# ============================================================================

def build_cover(prs, content: dict, palette):
    """
    Full-bleed cover slide.

    content:
      company: "CROSSINVEST SA"
      tagline: "WEALTH MANAGEMENT SINCE 1985"
      headline: "Weekly Strategy Report"
      subheadline: "The Week in Charts"
      date_range: "3 — 7 February 2026  |  Week 6"
      theme: "Five Regime Shifts Reshaping Markets"
      footer_text: "Via Pretorio 1  |  CH-6900 Lugano  |  FINMA Regulated"
    """
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide_w = prs.slide_width
    slide_h = prs.slide_height

    # Full navy background
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), slide_w, slide_h)
    bg.fill.solid()
    bg.fill.fore_color.rgb = rgb(palette.navy)
    bg.line.fill.background()

    # Gold accent bars
    for y_pos in [0, 7.38]:
        bar = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(0), Inches(y_pos), slide_w, Inches(0.12)
        )
        bar.fill.solid()
        bar.fill.fore_color.rgb = rgb(palette.gold)
        bar.line.fill.background()

    elements = [
        (1.0, content.get("company", ""), 38, palette.gold, True),
        (1.7, content.get("tagline", ""), 14, palette.gold, True),
        (2.7, content.get("headline", ""), 44, palette.white, False),
        (3.6, content.get("subheadline", ""), 24, palette.gold, False),
        (4.2, content.get("date_range", ""), 16, "#AABBCC", False),
        (4.85, content.get("theme", ""), 18, palette.white, True),
        (6.4, content.get("footer_text", ""), 11, "#8899AA", False),
    ]

    for y_off, text, size, color, bold in elements:
        if not text:
            continue
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(y_off), Inches(11.7), Inches(0.7))
        tf = tb.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.name = "Arial"
        if color.startswith("#"):
            r.font.color.rgb = rgb(color)
        else:
            r.font.color.rgb = rgb(color)

    # Separator line under tagline
    sep = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.35), Inches(2.5), Pt(2)
    )
    sep.fill.solid()
    sep.fill.fore_color.rgb = rgb(palette.gold)
    sep.line.fill.background()


def build_executive_summary(prs, content: dict, palette, meta: dict, page_num: int):
    """
    SCR-format executive summary.

    content:
      title: "Five simultaneous regime shifts..."
      tag: "#macro #strategy"
      sections: [
        {"label": "S", "text": "SITUATION — ...", "color": "#0C2340"},
        {"label": "C", "text": "COMPLICATION — ...", "color": "#CC0000"},
        {"label": "R", "text": "RESOLUTION — ...", "color": "#2E865F"},
        {"label": "", "text": "Closing paragraph...", "color": "#2C3E50"},
      ]
    """
    slide = make_content_slide(prs, palette, meta, page_num)
    add_slide_title(slide, content.get("title", ""), tag=content.get("tag"), palette=palette)

    y_pos = 2.3
    for section in content.get("sections", []):
        tb = slide.shapes.add_textbox(Inches(0.6), Inches(y_pos), Inches(12.0), Inches(1.1))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.space_after = Pt(4)
        p.line_spacing = Pt(16)
        run = p.add_run()
        run.text = section.get("text", "")
        run.font.size = Pt(11)
        run.font.color.rgb = rgb(palette.body_text)
        run.font.name = "Arial"
        y_pos += section.get("height", 1.15)


def build_chart_slide(prs, content: dict, chart_path: str, chart_num: int, palette, meta: dict, page_num: int):
    """
    Standard chart slide with assertion title + chart image.

    content:
      title: "Dow +2.5% while Nasdaq -1.8%..."
      tag: "#scoreboard #divergence"
      chart_dims: {left, top, width, height}  (optional overrides)
    """
    slide = make_content_slide(prs, palette, meta, page_num)
    add_slide_title(slide, content.get("title", ""), tag=content.get("tag"), palette=palette)
    add_chart_tag(slide, chart_num, palette=palette)

    dims = content.get("chart_dims", {})
    add_chart_image(
        slide, chart_path,
        left=dims.get("left", 0.4),
        top=dims.get("top", 2.5),
        width=dims.get("width", 12.5),
        height=dims.get("height", 4.5),
    )


def build_text_slide(prs, content: dict, palette, meta: dict, page_num: int):
    """
    Two-column text slide (opportunities/risks, what to watch).

    content:
      title: "Next week: ..."
      tag: "#outlook"
      left_title: "OPPORTUNITIES"
      left_color: "#2E865F"
      left_items: ["item 1", "item 2", ...]
      left_icon: "→"
      right_title: "KEY RISKS"
      right_color: "#CC0000"
      right_items: ["risk 1", "risk 2", ...]
      right_icon: "⚠"
    """
    slide = make_content_slide(prs, palette, meta, page_num)
    add_slide_title(slide, content.get("title", ""), tag=content.get("tag"), palette=palette)

    for side, x_start in [("left", 0.6), ("right", 7.0)]:
        col_title = content.get(f"{side}_title", "")
        col_color = content.get(f"{side}_color", palette.body_text)
        items = content.get(f"{side}_items", [])
        icon = content.get(f"{side}_icon", "→" if side == "left" else "⚠")

        if col_title:
            title_box = slide.shapes.add_textbox(Inches(x_start), Inches(2.2), Inches(5.5), Inches(0.4))
            tf = title_box.text_frame
            p = tf.paragraphs[0]
            r = p.add_run()
            r.text = col_title
            r.font.size = Pt(14)
            r.font.bold = True
            r.font.color.rgb = rgb(col_color)

        y_item = 2.7
        for item in items:
            tb = slide.shapes.add_textbox(Inches(x_start), Inches(y_item), Inches(5.5), Inches(0.35))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.line_spacing = Pt(14)
            run = p.add_run()
            run.text = f"{icon}  {item}"
            run.font.size = Pt(10.5)
            run.font.color.rgb = rgb(palette.body_text)
            y_item += 0.55

    # Vertical separator
    sep = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(6.5), Inches(2.3), Pt(1.5), Inches(4.2)
    )
    sep.fill.solid()
    sep.fill.fore_color.rgb = rgb(palette.light_gray)
    sep.line.fill.background()


def build_sources_slide(prs, content: dict, palette, meta: dict, page_num: int):
    """
    Data sources and disclaimer slide.

    content:
      title: "Data Sources & Methodology"
      left_sources: "Source 1\n\nSource 2\n\n..."
      right_sources: "Source A\n\nSource B\n\n..."
      disclaimer: "This document..."
    """
    slide = make_content_slide(prs, palette, meta, page_num)
    add_slide_title(slide, content.get("title", "Data Sources & Methodology"), palette=palette)

    # Left column
    tb_l = slide.shapes.add_textbox(Inches(0.6), Inches(2.0), Inches(5.8), Inches(4.2))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True
    p_l = tf_l.paragraphs[0]
    p_l.line_spacing = Pt(13)
    r_l = p_l.add_run()
    r_l.text = content.get("left_sources", "")
    r_l.font.size = Pt(8)
    r_l.font.color.rgb = rgb(palette.body_text)

    # Right column
    tb_r = slide.shapes.add_textbox(Inches(6.8), Inches(2.0), Inches(5.8), Inches(4.2))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    p_r = tf_r.paragraphs[0]
    p_r.line_spacing = Pt(13)
    r_r = p_r.add_run()
    r_r.text = content.get("right_sources", "")
    r_r.font.size = Pt(8)
    r_r.font.color.rgb = rgb(palette.body_text)

    # Separator
    sep = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(6.5), Inches(2.1), Pt(1), Inches(3.8)
    )
    sep.fill.solid()
    sep.fill.fore_color.rgb = rgb(palette.light_gray)
    sep.line.fill.background()

    # Disclaimer
    disclaimer = content.get("disclaimer", "")
    if disclaimer:
        tb_d = slide.shapes.add_textbox(Inches(0.6), Inches(6.2), Inches(12.0), Inches(0.7))
        tf_d = tb_d.text_frame
        tf_d.word_wrap = True
        p_d = tf_d.paragraphs[0]
        p_d.line_spacing = Pt(11)
        r_d = p_d.add_run()
        r_d.text = disclaimer
        r_d.font.size = Pt(7)
        r_d.font.italic = True
        r_d.font.color.rgb = rgb(palette.source_color)


def build_back_cover(prs, content: dict, palette):
    """
    Navy back cover with contact details.

    content:
      company: "CROSSINVEST SA"
      tagline: "Wealth Management Since 1985"
      contact_lines: ["Via Pretorio 1", "+41 91 973 28 00", "info@crossinvest.ch"]
      closing: "Thank you for your confidence"
      regulatory: "FINMA Regulated | Member of SAAM..."
      copyright: "© 2026 Crossinvest SA. All rights reserved."
    """
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide_w = prs.slide_width
    slide_h = prs.slide_height

    # Full navy background
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), slide_w, slide_h)
    bg.fill.solid()
    bg.fill.fore_color.rgb = rgb(palette.navy)
    bg.line.fill.background()

    # Gold accent lines
    for y_pos in [2.0, 5.5]:
        bar = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(4.5), Inches(y_pos), Inches(4.333), Pt(2)
        )
        bar.fill.solid()
        bar.fill.fore_color.rgb = rgb(palette.gold)
        bar.line.fill.background()

    # Company name
    tb1 = slide.shapes.add_textbox(Inches(0), Inches(2.3), prs.slide_width, Inches(0.8))
    tf1 = tb1.text_frame
    p1 = tf1.paragraphs[0]
    p1.alignment = PP_ALIGN.CENTER
    r1 = p1.add_run()
    r1.text = content.get("company", "CROSSINVEST SA")
    r1.font.size = Pt(36)
    r1.font.bold = True
    r1.font.color.rgb = rgb(palette.gold)
    r1.font.name = "Arial"

    # Tagline
    tb2 = slide.shapes.add_textbox(Inches(0), Inches(3.1), prs.slide_width, Inches(0.5))
    tf2 = tb2.text_frame
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    r2 = p2.add_run()
    r2.text = content.get("tagline", "")
    r2.font.size = Pt(16)
    r2.font.color.rgb = rgb(palette.white)
    r2.font.name = "Arial"

    # Contact lines
    contact_y = 3.8
    for line_text in content.get("contact_lines", []):
        tb = slide.shapes.add_textbox(Inches(0), Inches(contact_y), prs.slide_width, Inches(0.35))
        tf = tb.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = line_text
        r.font.size = Pt(12)
        r.font.color.rgb = rgb("#AABBCC")
        r.font.name = "Arial"
        contact_y += 0.35

    # Closing message
    closing = content.get("closing", "")
    if closing:
        tb3 = slide.shapes.add_textbox(Inches(0), Inches(5.8), prs.slide_width, Inches(0.5))
        tf3 = tb3.text_frame
        p3 = tf3.paragraphs[0]
        p3.alignment = PP_ALIGN.CENTER
        r3 = p3.add_run()
        r3.text = closing
        r3.font.size = Pt(14)
        r3.font.italic = True
        r3.font.color.rgb = rgb(palette.gold)

    # Regulatory & copyright
    for y_off, text_key, size in [(6.4, "regulatory", 9), (6.8, "copyright", 8)]:
        text = content.get(text_key, "")
        if text:
            tb = slide.shapes.add_textbox(Inches(0), Inches(y_off), prs.slide_width, Inches(0.35))
            tf = tb.text_frame
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            r = p.add_run()
            r.text = text
            r.font.size = Pt(size)
            r.font.color.rgb = rgb("#8899AA")
