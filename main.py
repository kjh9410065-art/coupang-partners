import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path

from PIL import Image, ImageTk

from coupang_api import search_products, prepare_product
from gemini_api import generate_text


# 프로그램 창의 기본 크기입니다.
WINDOW_WIDTH = 1100
WINDOW_HEIGHT = 760


class CoupangPartnersApp:
    """쿠팡 상품 검색 → 상품 선택 → AI 블로그 글 생성 GUI입니다."""

    def __init__(self, root):
        self.root = root
        self.root.title("쿠팡파트너스 블로그 자동 생성")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.minsize(900, 650)

        # 현재 검색 결과와 선택된 상품을 저장합니다.
        self.products = []
        self.selected_product = None
        self.product_photo = None

        self._build_ui()

    def _build_ui(self):
        """프로그램 화면을 구성합니다."""
        root = self.root
        root.columnconfigure(0, weight=1)
        root.rowconfigure(1, weight=1)

        # 상단 상품 영역
        top = ttk.Frame(root, padding=12)
        top.grid(row=0, column=0, sticky="nsew")
        top.columnconfigure(1, weight=1)
        top.rowconfigure(1, weight=1)

        # 상품 이미지가 너무 작아지지 않도록 고정 프레임을 사용합니다.
        self.image_frame = ttk.Frame(top, width=300, height=260, relief="solid", borderwidth=1)
        self.image_frame.grid(row=0, column=0, rowspan=3, padx=(0, 12), sticky="nw")
        self.image_frame.grid_propagate(False)

        self.image_label = ttk.Label(self.image_frame, text="상품 이미지")
        self.image_label.pack(fill="both", expand=True)

        # 검색 줄
        search_frame = ttk.Frame(top)
        search_frame.grid(row=0, column=1, sticky="ew")
        search_frame.columnconfigure(0, weight=1)

        self.keyword_entry = ttk.Entry(search_frame)
        self.keyword_entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.keyword_entry.bind("<Return>", lambda _event: self.search())

        self.search_button = ttk.Button(search_frame, text="상품 검색", command=self.search)
        self.search_button.grid(row=0, column=1)

        # 검색 결과 목록
        list_frame = ttk.Frame(top)
        list_frame.grid(row=1, column=1, sticky="nsew", pady=8)
        list_frame.columnconfigure(0, weight=1)
        list_frame.rowconfigure(0, weight=1)

        self.result_list = tk.Listbox(list_frame, height=6)
        self.result_list.grid(row=0, column=0, sticky="nsew")
        self.result_list.bind("<<ListboxSelect>>", self.select_product)

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.result_list.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.result_list.configure(yscrollcommand=scrollbar.set)

        # 선택 상품 정보 + AI 버튼
        bottom_top = ttk.Frame(top)
        bottom_top.grid(row=2, column=1, sticky="ew")
        bottom_top.columnconfigure(0, weight=1)

        self.product_info = ttk.Label(bottom_top, text="상품을 선택해주세요.", wraplength=600)
        self.product_info.grid(row=0, column=0, sticky="w")

        self.generate_button = ttk.Button(
            bottom_top,
            text="AI 글 생성",
            command=self.generate_blog,
            state="disabled",
        )
        self.generate_button.grid(row=0, column=1, padx=(12, 0))

        # 아래 영역은 생성된 블로그 글이 대부분을 차지하도록 구성합니다.
        body_frame = ttk.Frame(root, padding=(12, 0, 12, 8))
        body_frame.grid(row=1, column=0, sticky="nsew")
        body_frame.columnconfigure(0, weight=1)
        body_frame.rowconfigure(0, weight=1)

        self.blog_text = tk.Text(body_frame, wrap="word", undo=True)
        self.blog_text.grid(row=0, column=0, sticky="nsew")

        body_scroll = ttk.Scrollbar(body_frame, orient="vertical", command=self.blog_text.yview)
        body_scroll.grid(row=0, column=1, sticky="ns")
        self.blog_text.configure(yscrollcommand=body_scroll.set)

        # 하단 복사 버튼
        footer = ttk.Frame(root, padding=(12, 0, 12, 12))
        footer.grid(row=2, column=0, sticky="ew")
        footer.columnconfigure(0, weight=1)

        self.status_label = ttk.Label(footer, text="준비 완료")
        self.status_label.grid(row=0, column=0, sticky="w")

        self.copy_button = ttk.Button(footer, text="본문 복사", command=self.copy_blog)
        self.copy_button.grid(row=0, column=1)

    def search(self):
        """입력한 키워드로 쿠팡파트너스 상품을 검색합니다."""
        keyword = self.keyword_entry.get().strip()
        if not keyword:
            messagebox.showwarning("검색", "검색어를 입력해주세요.")
            return

        self.status_label.config(text="상품 검색 중...")
        self.search_button.config(state="disabled")
        self.generate_button.config(state="disabled")
        self.root.update_idletasks()

        try:
            # 검색 API의 최대 요청 수에 맞춰 10개까지만 가져옵니다.
            self.products = search_products(keyword, limit=10)
            self.result_list.delete(0, tk.END)

            for index, product in enumerate(self.products, start=1):
                name = product.get("productName", "상품명 없음")
                price = product.get("productPrice", "")
                display = f"{index}. {name}"
                if price != "":
                    display += f"  |  {price}원"
                self.result_list.insert(tk.END, display)

            if not self.products:
                messagebox.showinfo("검색 결과", "검색된 상품이 없습니다.")
                self.status_label.config(text="검색 결과 없음")
            else:
                self.status_label.config(text=f"{len(self.products)}개 상품 검색 완료")

        except Exception as exc:
            messagebox.showerror("검색 오류", str(exc))
            self.status_label.config(text="검색 오류")
        finally:
            self.search_button.config(state="normal")

    def select_product(self, _event=None):
        """검색 결과에서 상품을 선택하고 대표 이미지를 표시합니다."""
        selection = self.result_list.curselection()
        if not selection:
            return

        index = selection[0]
        self.selected_product = self.products[index]

        name = self.selected_product.get("productName", "상품명 없음")
        price = self.selected_product.get("productPrice", "")
        info = name
        if price != "":
            info += f"\n가격: {price}원"
        self.product_info.config(text=info)

        # 선택 즉시 상품 대표 이미지를 다운로드해 표시합니다.
        try:
            prepared = prepare_product(self.selected_product)
            self.selected_product = prepared
            self.show_product_image(prepared.get("image_path", ""))
            self.generate_button.config(state="normal")
            self.status_label.config(text="상품 선택 완료")
        except Exception as exc:
            self.show_product_image("")
            self.generate_button.config(state="normal")
            self.status_label.config(text="상품 선택 완료 / 이미지 없음")
            print(f"[상품 준비 오류] {exc}")

    def show_product_image(self, image_path):
        """다운로드한 상품 이미지를 고정된 영역 안에 맞춰 보여줍니다."""
        if not image_path or not Path(image_path).exists():
            self.product_photo = None
            self.image_label.config(image="", text="상품 이미지 없음")
            return

        try:
            image = Image.open(image_path).convert("RGB")
            image.thumbnail((270, 230), Image.Resampling.LANCZOS)
            self.product_photo = ImageTk.PhotoImage(image)
            self.image_label.config(image=self.product_photo, text="")
        except Exception as exc:
            self.product_photo = None
            self.image_label.config(image="", text="이미지 표시 실패")
            print(f"[이미지 표시 오류] {exc}")

    def generate_blog(self):
        """선택 상품의 실제 정보만 사용해 자연스러운 블로그 글을 생성합니다."""
        if not self.selected_product:
            messagebox.showwarning("AI 글 생성", "먼저 상품을 선택해주세요.")
            return

        product = self.selected_product
        name = product.get("productName", "")
        partner_url = product.get("partner_url", product.get("productUrl", ""))

        prompt = f"""
너는 네이버 블로그에 올릴 쿠팡파트너스 상품 소개 글을 작성하는 한국어 블로거다.
아래에 제공된 실제 상품 정보만 근거로 작성한다.

상품명: {name}
상품 설명에 사용할 수 있는 실제 정보:
- 상품명: {name}
- 상품 이미지 URL: {product.get('productImage', '')}
- 쿠팡 상품/파트너스 URL: {partner_url}
- 로켓배송 여부: {product.get('isRocket', '')}
- 무료배송 여부: {product.get('isFreeShipping', '')}

작성 규칙:
1. 제목을 맨 첫 줄에 자연스럽게 작성한다.
2. 제목과 본문을 구분해서 작성한다.
3. 가격은 본문에 절대 언급하지 않는다.
4. 상품 정보에 없는 성능, 소재, 구성품, 사용 후기, 인증, 수치 등을 만들어내지 않는다.
5. 실제 사람이 블로그에 작성한 것처럼 자연스럽고 부드러운 문체를 사용한다.
6. 같은 표현과 문장 구조를 반복하지 않는다.
7. '안녕하세요', '오늘은 ~에 대해 알아보겠습니다', '다음과 같습니다' 같은 뻔한 AI 문구는 가급적 사용하지 않는다.
8. 상품의 특징을 단순 나열하지 말고 어떤 상황에서 장점으로 느껴질 수 있는지 자연스럽게 풀어쓴다.
9. 확인할 수 있는 장점은 충분히 설명하되 근거 없는 장점은 만들지 않는다.
10. 단점이나 아쉬운 점은 실제 제공 정보에서 근거를 찾을 수 있을 때만 언급한다. 억지로 단점을 만들지 않는다.
11. 어떤 사람에게 잘 맞을지 자연스럽게 설명한다.
12. 마지막에는 구매를 고민해볼 만한 이유를 부담스럽지 않게 정리한다.
13. 과장 광고, 허위 후기, 직접 사용한 것처럼 보이는 표현은 금지한다.
14. 쿠팡파트너스 링크는 글 마지막에 그대로 넣는다.
15. 전체 글은 네이버 블로그에 바로 붙여넣을 수 있도록 작성한다.
16. '확인된 상품 정보' 같은 별도의 정보표는 만들지 않는다.

상품에 대한 정보가 부족하다면 부족한 정보를 인정하고, 확인된 내용 안에서 자연스럽게 글을 작성한다.
"""

        self.generate_button.config(state="disabled")
        self.status_label.config(text="Gemini가 글을 작성하고 있습니다...")
        self.blog_text.delete("1.0", tk.END)
        self.root.update_idletasks()

        try:
            text = generate_text(prompt)
            self.blog_text.insert("1.0", text)
            self.status_label.config(text="블로그 글 생성 완료")
        except Exception as exc:
            messagebox.showerror(
                "Gemini 오류",
                "블로그 글 생성 중 오류가 발생했습니다.\n\n" + str(exc),
            )
            self.status_label.config(text="글 생성 오류")
        finally:
            self.generate_button.config(state="normal")

    def copy_blog(self):
        """생성된 글 전체를 클립보드에 복사합니다."""
        text = self.blog_text.get("1.0", "end-1c").strip()
        if not text:
            messagebox.showinfo("복사", "복사할 글이 없습니다.")
            return

        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update()
        self.status_label.config(text="블로그 글을 클립보드에 복사했습니다.")


if __name__ == "__main__":
    # 프로그램을 시작하고 GUI 이벤트 루프를 실행합니다.
    root = tk.Tk()
    app = CoupangPartnersApp(root)
    root.mainloop()
