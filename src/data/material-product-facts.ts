import wanzhenData from "./data-sync/wanzhen.json";

type WanzhenAttributes = Record<string, string | number>;
type WanzhenProduct = {
  spu: { id: string; attributes: WanzhenAttributes };
  skus: Array<{ id: string; attributes: WanzhenAttributes }>;
};

type MaterialProductFactRow = {
  id: string;
  sku: string;
  category: string;
  color: string;
  size: string;
  material: string;
  fit: string;
  season: string;
  style: string;
  tryOnSize: string;
};

const products = (wanzhenData as { products: WanzhenProduct[] }).products;

function value(attributes: WanzhenAttributes, key: string) {
  const item = attributes[key];
  return item === undefined ? "" : String(item);
}

/** Reads the checked-in 万阵 product source used by the local demo. */
export function getWanzhenProductFacts(spuId: string): MaterialProductFactRow[] {
  const product = products.find((item) => item.spu.id === spuId);
  if (!product) return [];

  return product.skus.map((sku) => ({
    id: sku.id,
    sku: sku.id,
    category: value(product.spu.attributes, "category"),
    color: value(sku.attributes, "color"),
    size: value(sku.attributes, "size"),
    material: value(product.spu.attributes, "material"),
    fit: value(product.spu.attributes, "fit"),
    season: value(product.spu.attributes, "season"),
    style: value(product.spu.attributes, "style"),
    tryOnSize: value(product.spu.attributes, "fitting_size"),
  }));
}
