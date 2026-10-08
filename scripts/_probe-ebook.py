# -*- coding: utf-8 -*-
"""只探测 epub 的结构信息（条目名/压缩方式/大小），不导出、不打印正文内容。"""
import zipfile, sys, os, re

for path in [r"D:\ds\阅读\史蒂夫 · 乔布斯传.epub", r"D:\ds\阅读\暮色将尽.epub"]:
    print("=" * 70)
    print(os.path.basename(path), f"{os.path.getsize(path)/1024/1024:.1f} MB")
    if not os.path.exists(path):
        print("  文件不存在"); continue
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        print("  打开失败:", e); continue

    names = z.namelist()
    print(f"  条目数: {len(names)}")
    kinds = {}
    for n in names:
        e = os.path.splitext(n)[1].lower() or "(无扩展名)"
        kinds[e] = kinds.get(e, 0) + 1
    print("  条目类型:", ", ".join(f"{k}×{v}" for k, v in sorted(kinds.items(), key=lambda x: -x[1])[:8]))

    comp = {}
    for i in z.infolist():
        comp[i.compress_type] = comp.get(i.compress_type, 0) + 1
    print("  压缩方式:", ", ".join(f"{ {0: 'stored', 8: 'deflate'}.get(k, k)}x{v}" for k, v in comp.items()))

    # mimetype
    if "mimetype" in names:
        print("  mimetype:", z.read("mimetype")[:40].decode("utf-8", "replace").strip())

    # container.xml
    try:
        c = z.read("META-INF/container.xml").decode("utf-8", "replace")
        rootfile = re.search(r'full-path="([^"]+)"', c)
        print("  OPF:", rootfile.group(1) if rootfile else "未找到")
    except Exception as e:
        print("  container.xml 读取失败:", e); continue

    opf_path = rootfile.group(1)
    opf = z.read(opf_path).decode("utf-8", "replace")
    print("  epub 版本:", (re.search(r'version="([^"]+)"', opf) or [None, "?"])[1])
    print("  dc:title:", (re.search(r'<dc:title[^>]*>([^<]*)</dc:title>', opf) or [None, "?"])[1][:40])
    print("  dc:creator:", (re.search(r'<dc:creator[^>]*>([^<]*)</dc:creator>', opf) or [None, "?"])[1][:40])
    print("  dc:language:", (re.search(r'<dc:language[^>]*>([^<]*)</dc:language>', opf) or [None, "?"])[1])

    manifest = dict(re.findall(r'<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"', opf))
    manifest2 = dict(re.findall(r'<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"', opf))
    spine = re.findall(r'<itemref[^>]*idref="([^"]+)"', opf)
    print(f"  manifest 条目: {len(manifest) or len(manifest2)}   spine 章节数: {len(spine)}")

    # 章节文件大小
    base = os.path.dirname(opf_path)
    def resolve(h):
        h = h.split("#")[0]
        return os.path.normpath(os.path.join(base, h)).replace("\\", "/") if base else h
    sizes = []
    for idref in spine[:200]:
        href = manifest.get(idref) or manifest2.get(idref)
        if not href: continue
        p = resolve(href)
        try: sizes.append((p, z.getinfo(p).file_size))
        except Exception: pass
    if sizes:
        tot = sum(s for _, s in sizes)
        print(f"  已解析 {len(sizes)} 个章节文件，正文总大小 {tot/1024:.0f} KB，平均 {tot/max(1,len(sizes))/1024:.1f} KB")
        print("  前 3 个:", ", ".join(f"{os.path.basename(p)}({s//1024}KB)" for p, s in sizes[:3]))
    # 取一章样本看 XHTML 结构（只看标签，不打印正文）
    for p, s in sizes[:1]:
        try:
            html = z.read(p).decode("utf-8", "replace")
            tags = {}
            for m in re.finditer(r"<([a-zA-Z][a-zA-Z0-9]*)", html):
                t = m.group(1).lower()
                tags[t] = tags.get(t, 0) + 1
            top = sorted(tags.items(), key=lambda x: -x[1])[:10]
            print("  首章标签分布:", ", ".join(f"{k}×{v}" for k, v in top))
            print("  首章字符数:", len(html), " 含中文:", bool(re.search(r"[\u4e00-\u9fa5]", html)))
        except Exception as e:
            print("  首章读取失败:", e)
    # 封面
    cover = re.search(r'<meta[^>]*name="cover"[^>]*content="([^"]+)"', opf)
    cover_href = manifest.get(cover.group(1)) if cover else None
    if not cover_href:
        m = re.search(r'<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"', opf)
        if not m:
            m = re.search(r'<item[^>]*href="([^"]+)"[^>]*properties="[^"]*cover-image', opf)
        cover_href = m.group(1) if m else None
    if cover_href:
        cp = resolve(cover_href)
        try:
            ci = z.getinfo(cp)
            print(f"  封面: {os.path.basename(cp)} ({ci.file_size//1024} KB)")
        except Exception:
            print("  封面声明存在但未找到:", cover_href)
    else:
        print("  封面: 未声明")
    z.close()

print("=" * 70)
print("PDF 只探测大小与页数（用正则粗略数 /Type /Page）")
pdf = r"D:\ds\阅读\世界名人名言金典 人生忠告.pdf"
try:
    data = open(pdf, "rb").read()
    print(f"  {os.path.getsize(pdf)/1024/1024:.1f} MB, 头部: {data[:8]}")
    print("  /Type /Page 出现次数(近似页数):", len(re.findall(rb"/Type\s*/Page[^s]", data)))
    print("  是否为加密 PDF:", b"/Encrypt" in data)
except Exception as e:
    print("  读取失败:", e)
