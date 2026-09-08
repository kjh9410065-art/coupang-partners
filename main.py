import html
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
import webbrowser

from PIL import Image, ImageTk

from coupang_api import search_products, prepare_product
from gemini_api import generate_text


# 프로그램 창의 기본 크기입니다.
WINDOW_WIDTH = 1180
WINDOW_HEIGHT = 820

# 쿠팡파트너스 게시물에 필요한 고지 문구입니다.
PARTNERS_DISCLOSURE = (
    "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
)


class CoupangPartnersApp:
    """쿠팡 상품 검색부터 제목/본문 생성과 블로그 미리보기까지 처리합니다."""

    def __init__(self, root):
        self.root = root
        self.root.title("쿠팡파트너스 블로그 자동 생성")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.minsize(1000, 700)

        # 검색 결과와 현재 선택 상품을 보관합니다.
        self.products = []
        self.selected_product = None
        self.product_photo = None
        self.title_candidates = []

        self._build_ui()

    def _build_ui(self):
        """상품 선택, 제목 선택, 본문 편집 영역을 구성합니다."""
        root = self.root
        root.columnconfigure(0, weight=1)
        root.rowconfigure(1, weight=1)

        # ------------------------------
        # 상단 상품 선택 영역
        # ------------------------------
        top = ttk.LabelFrame(root, text="상품 선택", padding=10)
        top.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 8))
        top.columnconfigure(1, weight=1)

        # 대표 상품 이미지를 일정한 크기로 표시합니다.
        self.image_frame = ttk.Frame(
            top,
            width=250,
            height=220,
            relief="solid",
            borderwidth=1,
        )
        self.image_frame.grid(
            row=0,
            column=0,
            rowspan=3,
            padx=(0, 12),
            sticky="nw",
        )
        self.image_frame.grid_propagate(False)

        self.image_label = ttk.Label(self.image_frame, text="상품 이미지")
        self.image_label.pack(fill="both", expand=True)

        # 검색 입력창입니다.
        search_frame = ttk.Frame(top)
        search_frame.grid(row=0, column=1, sticky="ew")
        search_frame.columnconfigure(0, weight=1)

        self.keyword_entry = ttk.Entry(search_frame)
        self.keyword_entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.keyword_entry.bind("<Return>", lambda _event: self.search())

        self.search_button = ttk.Button(
            search_frame,
            text="상품 검색",
            command=self.search,
        )
        self.search_button.grid(row=0, column=1)

        # 검색 결과 목록입니다.
        list_frame = ttk.Frame(top)
        list_frame.grid(row=1, column=1, sticky="ew", pady=7)
        list_frame.columnconfigure(0, weight=1)

        self.result_list = tk.Listbox(list_frame, height=5)
        self.result_list.grid(row=0, column=0, sticky="ew")
        self.result_list.bind("<<ListboxSelect>>", self.select_product)

        result_scroll = ttk.Scrollbar(
            list_frame,
            orient="vertical",
            command=self.result_list.yview,
        )
        result_scroll.grid(row=0, column=1, sticky="ns")
        self.result_list.configure(yscrollcommand=result_scroll.set)

        # 선택 상품 정보와 제목 생성 버튼입니다.
        product_action = ttk.Frame(top)
        product_action.grid(row=2, column=1, sticky="ew")
        product_action.columnconfigure(0, weight=1)

        self.product_info = ttk.Label(
            product_action,
            text="상품을 선택해주세요.",
            wraplength=650,
        )
        self.product_info.grid(row=0, column=0, sticky="w")

        self.title_button = ttk.Button(
            product_action,
            text="제목 5개 만들기",
            command=self.generate_titles,
            state="disabled",
        )
        self.title_button.grid(row=0, column=1, padx=(10, 0))

        # ------------------------------
        # 중앙 제목 + 본문 영역
        # ------------------------------
        content = ttk.Frame(root, padding=(10, 0, 10, 8))
        content.grid(row=1, column=0, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)

        # 제목 후보를 선택하는 영역입니다.
        title_box = ttk.LabelFrame(content, text="제목 선택", padding=8)
        title_box.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        title_box.columnconfigure(0, weight=1)

        title_list_frame = ttk.Frame(title_box)
        title_list_frame.grid(row=0, column=0, sticky="ew")
        title_list_frame.columnconfigure(0, weight=1)

        self.title_list = tk.Listbox(title_list_frame, height=5)
        self.title_list.grid(row=0, column=0, sticky="ew")
        self.title_list.bind("<<ListboxSelect>>", self.select_title)

        title_scroll = ttk.Scrollbar(
            title_list_frame,
            orient="vertical",
            command=self.title_list.yview,
        )
        title_scroll.grid(row=0, column=1, sticky="ns")
        self.title_list.configure(yscrollcommand=title_scroll.set)

        title_action = ttk.Frame(title_box)
        title_action.grid(row=1, column=0, sticky="ew", pady=(7, 0))
        title_action.columnconfigure(0, weight=1)

        self.selected_title_label = ttk.Label(
            title_action,
            text="제목을 선택하면 본문을 만들 수 있습니다.",
            wraplength=750,
        )
        self.selected_title_label.grid(row=0, column=0, sticky="w")

        self.body_button = ttk.Button(
            title_action,
            text="선택 제목으로 본문 생성",
            command=self.generate_blog,
            state="disabled",
        )
        self.body_button.grid(row=0, column=1, padx=(10, 0))

        # 생성된 글을 직접 확인하거나 수정할 수 있는 영역입니다.
        body_box = ttk.LabelFrame(content, text="네이버 블로그 본문", padding=8)
        body_box.grid(row=1, column=0, sticky="nsew")
        body_box.columnconfigure(0, weight=1)
        body_box.rowconfigure(0, weight=1)

        self.blog_text = tk.Text(
            body_box,
            wrap="word",
            undo=True,
            font=("맑은 고딕", 11),
        )
        self.blog_text.grid(row=0, column=0, sticky="nsew")

        body_scroll = ttk.Scrollbar(
            body_box,
            orient="vertical",
            command=self.blog_text.yview,
        )
        body_scroll.grid(row=0, column=1, sticky="ns")
        self.blog_text.configure(yscrollcommand=body_scroll.set)

        # ------------------------------
        # 하단 버튼 영역
        # ------------------------------
        footer = ttk.Frame(root, padding=(10, 0, 10, 10))
        footer.grid(row=2, column=0, sticky="ew")
        footer.columnconfigure(0, weight=1)

        self.status_label = ttk.Label(footer, text="준비 완료")
        self.status_label.grid(row=0, column=0, sticky="w")

        # 일반 텍스트를 클립보드에 복사합니다.
        self.copy_button = ttk.Button(
            footer,
            text="본문 전체 복사",
            command=self.copy_blog,
        )
        self.copy_button.grid(row=0, column=1, padx=(8, 0))

        # 이미지와 제목까지 포함한 브라우저 미리보기를 엽니다.
        self.preview_button = ttk.Button(
            footer,
            text="블로그 미리보기",
            command=self.preview_blog,
        )
        self.preview_button.grid(row=0, column=2, padx=(8, 0))

        self.clear_button = ttk.Button(
            footer,
            text="초기화",
            command=self.clear_all,
        )
        self.clear_button.grid(row=0, column=3, padx=(8, 0))

    def search(self):
        """입력한 키워드로 쿠팡파트너스 상품을 검색합니다."""
        keyword = self.keyword_entry.get().strip()
        if not keyword:
            messagebox.showwarning("상품 검색", "검색어를 입력해주세요.")
            return

        self.status_label.config(text="상품 검색 중...")
        self.search_button.config(state="disabled")
        self.title_button.config(state="disabled")
        self.body_button.config(state="disabled")
        self.root.update_idletasks()

        try:
            # 검색 API의 요청 한도에 맞춰 최대 10개만 가져옵니다.
            self.products = search_products(keyword, limit=10)
            self.result_list.delete(0, tk.END)
            self.title_list.delete(0, tk.END)
            self.title_candidates = []
            self.selected_product = None

            for index, product in enumerate(self.products, start=1):
                name = product.get("productName", "상품명 없음")
                price = product.get("productPrice", "")
                display = f"{index}. {name}"
                if price != "":
                    display += f"  |  {price}원"
                self.result_list.insert(tk.END, display)

            if not self.products:
                self.status_label.config(text="검색 결과 없음")
                messagebox.showinfo("상품 검색", "검색된 상품이 없습니다.")
            else:
                self.status_label.config(
                    text=f"{len(self.products)}개 상품 검색 완료 / 상품을 선택해주세요."
                )

        except Exception as exc:
            self.status_label.config(text="상품 검색 오류")
            messagebox.showerror("상품 검색 오류", str(exc))
        finally:
            self.search_button.config(state="normal")

    def select_product(self, _event=None):
        """검색 결과에서 상품을 선택하고 대표 이미지를 준비합니다."""
        selection = self.result_list.curselection()
        if not selection:
            return

        index = selection[0]
        self.selected_product = self.products[index]
        self.title_candidates = []
        self.title_list.delete(0, tk.END)
        self.body_button.config(state="disabled")

        name = self.selected_product.get("productName", "상품명 없음")
        price = self.selected_product.get("productPrice", "")

        info = name
        if price != "":
            info += f"\n가격: {price}원"
        self.product_info.config(text=info)

        self.status_label.config(text="상품 정보와 이미지를 준비하는 중...")
        self.title_button.config(state="disabled")
        self.root.update_idletasks()

        try:
            # 대표 이미지와 파트너 링크를 상품 데이터에 추가합니다.
            prepared = prepare_product(self.selected_product)
            self.selected_product = prepared
            self.show_product_image(prepared.get("image_path", ""))
            self.title_button.config(state="normal")
            self.status_label.config(text="상품 선택 완료 / 제목을 만들어주세요.")
        except Exception as exc:
            self.show_product_image("")
            self.title_button.config(state="normal")
            self.status_label.config(text="상품 선택 완료 / 이미지 없음")
            print(f"[상품 준비 오류] {exc}")

    def show_product_image(self, image_path):
        """대표 상품 이미지를 화면에 표시합니다."""
        if not image_path or not Path(image_path).exists():
            self.product_photo = None
            self.image_label.config(image="", text="상품 이미지 없음")
            return

        try:
            image = Image.open(image_path).convert("RGB")
            image.thumbnail((225, 195), Image.Resampling.LANCZOS)
            self.product_photo = ImageTk.PhotoImage(image)
            self.image_label.config(image=self.product_photo, text="")
        except Exception as exc:
            self.product_photo = None
            self.image_label.config(image="", text="이미지 표시 실패")
            print(f"[이미지 표시 오류] {exc}")

    def generate_titles(self):
        """선택 상품을 바탕으로 블로그 제목 후보 5개를 생성합니다."""
        if not self.selected_product:
            messagebox.showwarning("제목 생성", "먼저 상품을 선택해주세요.")
            return

        product = self.selected_product
        name = product.get("productName", "")
        rocket = product.get("isRocket", False)
        free_shipping = product.get("isFreeShipping", False)

        prompt = f"""
네이버 블로그용 쿠팡파트너스 상품 소개 글의 제목 후보를 정확히 5개 작성해라.

실제 상품명: {name}
로켓배송 여부: {rocket}
무료배송 여부: {free_shipping}

규칙:
- 서로 다른 방향의 제목 5개를 만든다.
- 실제 정보에 없는 특징이나 성능을 제목에 넣지 않는다.
- 가격, 할인율, 최저가, 가성비 표현을 넣지 않는다.
- 실제 구매나 사용 경험을 암시하는 '후기', '내돈내산' 등을 사용하지 않는다.
- 과장 광고처럼 보이는 표현을 피한다.
- 같은 단어와 문장 구조를 반복하지 않는다.
- 자연스러운 한국어 블로그 제목으로 작성한다.
- 반드시 1. 제목 형식으로 5줄만 출력한다.
"""

        self.title_button.config(state="disabled")
        self.body_button.config(state="disabled")
        self.status_label.config(text="AI가 제목 5개를 만들고 있습니다...")
        self.root.update_idletasks()

        try:
            raw = generate_text(prompt)
            titles = self._parse_titles(raw)

            if not titles:
                raise Exception("AI가 사용할 수 있는 제목을 만들지 못했습니다.")

            self.title_candidates = titles[:5]
            self.title_list.delete(0, tk.END)

            for index, title in enumerate(self.title_candidates, start=1):
                self.title_list.insert(tk.END, f"{index}. {title}")

            self.selected_title_label.config(
                text="제목 후보가 생성되었습니다. 사용할 제목을 선택해주세요."
            )
            self.status_label.config(
                text=f"제목 {len(self.title_candidates)}개 생성 완료"
            )

        except Exception as exc:
            messagebox.showerror("제목 생성 오류", str(exc))
            self.status_label.config(text="제목 생성 오류")
        finally:
            self.title_button.config(state="normal")

    @staticmethod
    def _parse_titles(text):
        """Gemini 응답에서 제목 후보만 추출합니다."""
        titles = []

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue

            cleaned = line

            # 번호가 붙은 응답을 처리합니다.
            if len(cleaned) >= 2 and cleaned[0].isdigit():
                if cleaned[1:2] in (".", ")", "-", ":"):
                    cleaned = cleaned[2:].strip()
            elif cleaned.startswith("-"):
                cleaned = cleaned[1:].strip()

            cleaned = cleaned.strip('"\'“”‘’')

            # 너무 짧은 문자열과 중복 제목은 제외합니다.
            if len(cleaned) >= 5 and cleaned not in titles:
                titles.append(cleaned)

        return titles

    def select_title(self, _event=None):
        """제목 목록에서 선택한 제목을 본문 생성 단계에 연결합니다."""
        selection = self.title_list.curselection()
        if not selection:
            self.body_button.config(state="disabled")
            return

        index = selection[0]
        if index >= len(self.title_candidates):
            return

        title = self.title_candidates[index]
        self.selected_title_label.config(text=f"선택한 제목: {title}")
        self.body_button.config(state="normal")
        self.status_label.config(text="제목 선택 완료 / 본문을 생성할 수 있습니다.")

    def generate_blog(self):
        """선택한 제목과 실제 상품 정보만 사용해 본문을 생성합니다."""
        if not self.selected_product:
            messagebox.showwarning("본문 생성", "먼저 상품을 선택해주세요.")
            return

        selection = self.title_list.curselection()
        if not selection:
            messagebox.showwarning("본문 생성", "먼저 사용할 제목을 선택해주세요.")
            return

        title_index = selection[0]
        if title_index >= len(self.title_candidates):
            messagebox.showwarning("본문 생성", "제목을 다시 선택해주세요.")
            return

        product = self.selected_product
        title = self.title_candidates[title_index]
        name = product.get("productName", "")
        partner_url = product.get("partner_url", product.get("productUrl", ""))
        rocket = product.get("isRocket", False)
        free_shipping = product.get("isFreeShipping", False)

        prompt = f"""
너는 네이버 블로그에 올릴 쿠팡파트너스 상품 소개 글을 작성하는 한국어 블로거다.
반드시 아래에 제공된 실제 상품 정보만 근거로 작성한다.

[선택한 제목]
{title}

[실제 상품 정보]
상품명: {name}
로켓배송 여부: {rocket}
무료배송 여부: {free_shipping}

[작성 목표]
광고 문구처럼 딱딱한 글이 아니라 사람이 읽기 편한 자연스러운 상품 소개 글을 작성한다.
직접 사용한 것처럼 쓰지 않으며 실제 구매자 후기를 만들어내지 않는다.

[본문 구성]
1. 선택한 제목을 첫 줄에 그대로 쓴다.
2. 제목 아래에 자연스러운 도입부를 작성한다.
3. 상품이 어떤 제품인지 상품명에서 확인되는 범위 안에서 설명한다.
4. 제공된 실제 정보로 판단할 수 있는 특징과 장점을 충분히 풀어쓴다.
5. 단순 나열을 피하고 어떤 상황에서 도움이 될 수 있는지 자연스럽게 연결한다.
6. 아쉬운 점은 실제 제공 정보에서 판단할 수 있을 때만 언급한다.
7. 정보가 부족한 부분은 추측하지 않는다.
8. 어떤 사람에게 잘 맞을지 자연스럽게 정리한다.
9. 마지막에는 구매를 고민하는 사람이 판단하기 쉽도록 부담스럽게 권하지 않고 마무리한다.
10. 마지막 줄에는 쿠팡파트너스 링크를 그대로 한 번 넣는다.

[절대 금지]
- 가격, 할인율, 최저가, 가성비 평가를 언급하지 않는다.
- 상품 정보에 없는 소재, 크기, 무게, 성능, 기능, 구성품, 인증, 수치 등을 만들어내지 않는다.
- 실제 사용 후기나 구매자 후기를 만들어내지 않는다.
- '내돈내산', '직접 사용해보니' 같은 경험형 표현을 사용하지 않는다.
- 확인되지 않은 장점을 억지로 추가하지 않는다.
- 과장 광고나 확정적인 구매 권유를 하지 않는다.
- 흔한 AI식 도입 문구를 반복하지 않는다.
- 제목을 임의로 변경하지 않는다.
- 별도의 '확인된 상품 정보' 표를 만들지 않는다.

[분량]
짧은 한두 문단으로 끝내지 말고, 확인 가능한 정보 안에서 충분한 분량으로 작성한다.
문단마다 같은 표현을 반복하지 말고 자연스럽게 이어간다.

[마지막 링크]
{partner_url}
"""

        self.body_button.config(state="disabled")
        self.title_button.config(state="disabled")
        self.status_label.config(text="Gemini가 블로그 본문을 작성하고 있습니다...")
        self.blog_text.delete("1.0", tk.END)
        self.root.update_idletasks()

        try:
            text = generate_text(prompt).strip()

            # 고지 문구는 게시물 최상단에 넣습니다.
            final_text = f"{PARTNERS_DISCLOSURE}\n\n{text}"
            self.blog_text.insert("1.0", final_text)
            self.status_label.config(text="블로그 본문 생성 완료")

        except Exception as exc:
            messagebox.showerror(
                "본문 생성 오류",
                "블로그 글 생성 중 오류가 발생했습니다.\n\n" + str(exc),
            )
            self.status_label.config(text="본문 생성 오류")
        finally:
            self.title_button.config(state="normal" if self.selected_product else "disabled")
            self.body_button.config(state="normal")

    def _get_body_without_disclosure(self):
        """미리보기용 본문에서 고지 문구를 분리하지 않고 그대로 사용합니다."""
        return self.blog_text.get("1.0", "end-1c").strip()

    def preview_blog(self):
        """제목, 상품 이미지, 본문, 파트너스 링크를 포함한 HTML 미리보기를 엽니다."""
        if not self.selected_product:
            messagebox.showwarning("미리보기", "먼저 상품을 선택해주세요.")
            return

        raw_text = self._get_body_without_disclosure()
        if not raw_text:
            messagebox.showwarning("미리보기", "먼저 블로그 본문을 생성해주세요.")
            return

        product = self.selected_product
        title = "상품 소개"
        selection = self.title_list.curselection()
        if selection and selection[0] < len(self.title_candidates):
            title = self.title_candidates[selection[0]]

        # 본문 텍스트를 HTML 문단으로 변환하되, 링크 줄은 별도로 처리합니다.
        partner_url = product.get("partner_url", product.get("productUrl", ""))
        escaped_url = html.escape(partner_url, quote=True)
        escaped_text = html.escape(raw_text)
        paragraphs = []
        for block in escaped_text.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            paragraphs.append(
                "<p>" + block.replace("\n", "<br>") + "</p>"
            )

        # 준비된 관련 상품 이미지만 미리보기에 넣습니다.
        image_paths = product.get("image_paths", [])
        if not image_paths and product.get("image_path"):
            image_paths = [product.get("image_path")]

        image_html = []
        for image_path in image_paths:
            if not image_path:
                continue
            path = Path(image_path)
            if not path.exists():
                continue
            image_html.append(
                f'<img src="{html.escape(path.as_uri(), quote=True)}" '
                'style="max-width:100%;height:auto;margin:16px 0;display:block;">'
            )

        html_content = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
body {{
    margin: 0;
    padding: 32px 20px 60px;
    background: #f5f5f5;
    font-family: 'Malgun Gothic', sans-serif;
    color: #222;
    line-height: 1.8;
}}
.article {{
    max-width: 760px;
    margin: 0 auto;
    background: white;
    padding: 36px;
    box-sizing: border-box;
}}
h1 {{
    margin-top: 0;
    line-height: 1.4;
    font-size: 28px;
}}
p {{
    margin: 0 0 20px;
}}
.notice {{
    color: #666;
    font-size: 13px;
    margin-bottom: 28px;
}}
.images {{
    margin: 20px 0;
}}
.partner {{
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid #eee;
}}
.partner a {{
    word-break: break-all;
}}
</style>
</head>
<body>
<div class="article">
    <div class="notice">{html.escape(PARTNERS_DISCLOSURE)}</div>
    <h1>{html.escape(title)}</h1>
    <div class="images">{''.join(image_html)}</div>
    <div class="body">{''.join(paragraphs)}</div>
    <div class="partner">
        <a href="{escaped_url}" target="_blank" rel="noopener">{escaped_url}</a>
    </div>
</div>
</body>
</html>"""

        preview_path = Path(__file__).resolve().parent / "images" / "blog_preview.html"
        preview_path.parent.mkdir(exist_ok=True)
        preview_path.write_text(html_content, encoding="utf-8")

        # 기본 브라우저에서 미리보기를 엽니다.
        webbrowser.open(preview_path.as_uri())
        self.status_label.config(text="블로그 미리보기를 열었습니다.")

    def copy_blog(self):
        """생성된 블로그 본문 전체를 클립보드에 복사합니다."""
        text = self.blog_text.get("1.0", "end-1c").strip()
        if not text:
            messagebox.showinfo("복사", "복사할 글이 없습니다.")
            return

        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update()
        self.status_label.config(text="블로그 본문 전체를 클립보드에 복사했습니다.")

    def clear_all(self):
        """현재 작업 내용을 모두 초기화합니다."""
        self.products = []
        self.selected_product = None
        self.product_photo = None
        self.title_candidates = []

        self.keyword_entry.delete(0, tk.END)
        self.result_list.delete(0, tk.END)
        self.title_list.delete(0, tk.END)
        self.blog_text.delete("1.0", tk.END)

        self.image_label.config(image="", text="상품 이미지")
        self.product_info.config(text="상품을 선택해주세요.")
        self.selected_title_label.config(text="제목을 선택하면 본문을 만들 수 있습니다.")
        self.title_button.config(state="disabled")
        self.body_button.config(state="disabled")
        self.status_label.config(text="초기화 완료")


if __name__ == "__main__":
    # Tkinter 프로그램을 시작합니다.
    root = tk.Tk()
    app = CoupangPartnersApp(root)
    root.mainloop()
