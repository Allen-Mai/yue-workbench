# -*- coding: utf-8 -*-
"""诊断 TOC(NCX) 的 src 与 OPF spine 的 href 为什么不匹配（只打印路径，不打印正文）"""
import zipfile, re, os, posixpath

for path in [r"D:\ds\阅读\史蒂夫 · 乔布斯传.epub", r"D:\ds\阅读\暮色将尽.epub"]:
    print("=" * 72)
    print(os.path.basename(path))
    z = zipfile.ZipFile(path)
    names = z.namelist()

    # OPF
    c = z.read("META-INF/container.xml").decode("utf-8", "replace")
    opf_path = re.search(r'full-path="([^"]+)"', c).group(1)
    base = posixpath.dirname(opf_path)
    opf = z.read(opf_path).decode("utf-8", "replace")
    print("  OPF:", opf_path, "| base:", base or "(根)")

    # manifest
    items = {}
    for m in re.finditer(r"<item\b[^>]*>", opf):
        tag = m.group(0)
        i = re.search(r'\bid="([^"]+)"', tag)
        h = re.search(r'\bhref="([^"]+)"', tag)
        t = re.search(r'media-type="([^"]+)"', tag)
        if i and h:
            items[i.group(1)] = (h.group(1), t.group(1) if t else "")
    spine = [m.group(1) for m in re.finditer(r'<itemref\b[^>]*\bidref="([^"]+)"', opf)]
    print(f"  manifest {len(items)}  spine {len(spine)}")

    spine_hrefs = []
    for idref in spine:
        if idref in items:
            h = items[idref][0]
            spine_hrefs.append(posixpath.normpath(posixpath.join(base, h)))
    print("  spine 前 4 个 href:", spine_hrefs[:4])

    # NCX / nav
    ncx = None
    for i, (h, t) in items.items():
        if "dtbncx" in t or h.endswith(".ncx"):
            ncx = posixpath.normpath(posixpath.join(base, h))
            break
    if not ncx:
        for i, (h, t) in items.items():
            if h.endswith(".xml"):
                ncx = posixpath.normpath(posixpath.join(base, h))
                break
    print("  TOC 文件:", ncx)
    if not ncx:
        print("  ✗ 没有 NCX/nav")
        continue
    ncx_dir = posixpath.dirname(ncx)
    print("  TOC 所在目录:", ncx_dir or "(根)")
    xml = z.read(ncx).decode("utf-8", "replace")
    pairs = re.findall(r'<navLabel>\s*<text>(.*?)</text>\s*</navLabel>\s*<content\s+src="([^"]+)"', xml, re.S)
    if not pairs:
        pairs = [(m.group(1), m.group(2)) for m in re.finditer(r'<content\s+src="([^"]+)"', xml)]
    print(f"  TOC 条目数: {len(pairs)}")
    for text, src in pairs[:5]:
        # 两种解析方式
        rel_to_opf = posixpath.normpath(posixpath.join(base, src.split("#")[0]))
        rel_to_ncx = posixpath.normpath(posixpath.join(ncx_dir, src.split("#")[0]))
        in_a = "✓" if rel_to_opf in spine_hrefs else "✗"
        in_b = "✓" if rel_to_ncx in spine_hrefs else "✗"
        print(f"    「{text[:24]}」src={src[:40]}")
        print(f"       相对OPF {in_a} {rel_to_opf[:60]}")
        print(f"       相对NCX {in_b} {rel_to_ncx[:60]}")
    z.close()
