import threading
import tkinter as tk
from tkinter import messagebox

from main import CoupangPartnersApp
from auto_mode import create_today_post


class AutoCoupangPartnersApp(CoupangPartnersApp):
    """기존 GUI에 '오늘의 상품 자동 생성' 기능을 추가합니다."""

    def __init__(self, root):
        super().__init__(root)
        # 기존 하단 버튼 오른쪽에 원클릭 자동 생성 버튼을 추가합니다.
        self.auto_button = tk.Button(
            root,
            text="오늘의 상품으로 글 만들기",
            command=self.generate_today,
            font=("맑은 고딕", 11, "bold"),
            padx=12,
            pady=6,
        )
        self.auto_button.place(relx=1.0, rely=1.0, anchor="se", x=-10, y=-10)

    def generate_today(self):
        """트렌드 검색어 → 쿠팡 상품 → 블로그 글을 한 번에 생성합니다."""
        if getattr(self, "_auto_running", False):
            return

        self._auto_running = True
        self.auto_button.config(state="disabled", text="오늘의 상품 찾는 중...")
        self.status_label.config(text="실시간 트렌드에서 상품 주제를 찾는 중...")
        self.root.update_idletasks()

        # 네트워크 작업 때문에 GUI가 멈추지 않도록 별도 스레드에서 실행합니다.
        thread = threading.Thread(target=self._auto_worker, daemon=True)
        thread.start()

    def _auto_worker(self):
        try:
            product, post = create_today_post()
            self.root.after(0, lambda: self._auto_success(product, post))
        except Exception as exc:
            self.root.after(0, lambda: self._auto_error(str(exc)))

    def _auto_success(self, product, post):
        """자동 생성 결과를 기존 GUI에 채웁니다."""
        self.products = [product]
        self.selected_product = product
        self.title_candidates = []

        # 기존 상품 목록에도 자동 선택 결과를 표시합니다.
        self.result_list.delete(0, tk.END)
        self.result_list.insert(
            tk.END,
            f"오늘의 상품 | {product.get('productName', '상품명 없음')}"
        )

        self.result_list.selection_set(0)
        self.product_info.config(
            text=(
                f"{product.get('productName', '상품명 없음')}\n"
                f"가격: {product.get('productPrice', '')}원\n"
                f"트렌드 검색어: {product.get('trend_keyword', '')}"
            )
        )

        self.show_product_image(product.get("image_path", ""))
        self.blog_text.delete("1.0", tk.END)
        self.blog_text.insert("1.0", post)
        self.title_button.config(state="normal")
        self.body_button.config(state="disabled")
        self.status_label.config(
            text=f"오늘의 상품 글 생성 완료 | {product.get('trend_keyword', '')}"
        )

        self._auto_running = False
        self.auto_button.config(state="normal", text="오늘의 상품으로 글 만들기")

    def _auto_error(self, error):
        """자동 생성 실패 내용을 사용자에게 표시합니다."""
        self._auto_running = False
        self.auto_button.config(state="normal", text="오늘의 상품으로 글 만들기")
        self.status_label.config(text="자동 생성 실패")
        messagebox.showerror("오늘의 상품 생성 오류", error)


if __name__ == "__main__":
    root = tk.Tk()
    app = AutoCoupangPartnersApp(root)
    root.mainloop()
