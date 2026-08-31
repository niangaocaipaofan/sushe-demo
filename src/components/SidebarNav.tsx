import appBadgingIcon from "../assets/app-badging.svg";
import type { ProductWorkflow } from "../data/workflows";
import { BarcodeIcon, InsightsIcon, TaskIcon } from "./SidebarIcons";

export type WorkspaceSection = "insights" | "tasks" | "publish";

interface SidebarNavProps {
  products: ProductWorkflow[];
  activeSection: WorkspaceSection;
  selectedProductId: string;
  onSelectSection: (section: WorkspaceSection) => void;
  onSelectProduct: (productId: string) => void;
}

export function SidebarNav({
  products,
  activeSection,
  selectedProductId,
  onSelectSection,
  onSelectProduct,
}: SidebarNavProps) {
  return (
    <aside className="sidebar-nav">
      <div className="space-nav">
          <div className="space-switcher">
          <div className="space-badge">
            <img className="space-app-badging-icon" src={appBadgingIcon} alt="工作空间" />
          </div>
          <div className="space-title"><strong>商品发布</strong><small>SUSHE 人机协作空间</small></div>
        </div>

        <nav className="space-menu" aria-label="主导航">
          <button className={`space-menu-item space-menu-insights${activeSection === "insights" ? " is-selected" : ""}`} type="button" onClick={() => onSelectSection("insights")}>
            <InsightsIcon />
            全景洞察
          </button>
          <div className="menu-divider" />
          <button className={`space-menu-item space-menu-tasks${activeSection === "tasks" ? " is-selected" : ""}`} type="button" onClick={() => onSelectSection("tasks")}>
            <TaskIcon />
            个人任务
          </button>
          <div className="menu-divider" />
          <div className="menu-section-title">发布任务</div>
          <div className={`product-tree${activeSection === "publish" ? " is-active" : ""}`}>
            {products.map((product) => {
              const selected = activeSection === "publish" && selectedProductId === product.id;
              return (
                <button className={`product-tree-item${selected ? " is-selected" : ""}`} key={product.id} type="button" onClick={() => { onSelectSection("publish"); onSelectProduct(product.id); }}>
                  <span className="tree-branch"><BarcodeIcon /></span>
                  <span className="product-copy"><span>{product.name}</span><small>{product.spu}</small></span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}
