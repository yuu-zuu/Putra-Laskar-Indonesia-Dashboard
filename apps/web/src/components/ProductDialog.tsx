import { useState, type FormEvent } from "react";
import type { Product } from "@spbu/contracts";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { createProduct } from "../data/masterGateway.js";

export function ProductDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const { t, l } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const product = await createProduct({ code: code.toUpperCase(), name, unit: "LITER" });
      onSaved(product);
      toast(l("Produk ditambahkan.", "Product added.", "产品已添加。"), "success");
      onClose();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Produk gagal ditambahkan.", "Could not add the product.", "无法添加产品。"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{l("Master produk", "Product master", "产品主数据")}</p>
            <h2 id="product-dialog-title">{l("Tambah produk", "Add product", "添加产品")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="field">
            <span>{l("Kode", "Code", "代码")}</span>
            <input
              required
              minLength={2}
              maxLength={40}
              pattern="[A-Za-z0-9_-]+"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{l("Nama produk", "Product name", "产品名称")}</span>
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{l("Satuan", "Unit", "单位")}</span>
            <input value="LITER" readOnly />
          </label>
          <footer className="form-actions">
            <button className="button" type="button" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="button button-primary" disabled={saving}>
              {saving ? t("common.loading") : l("Simpan", "Save", "保存")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
