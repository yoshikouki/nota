export interface NotaPage {
  id: string;
  title: string;
  url: string;
  parentId: string | null;
  parentType: "page" | "database" | "workspace";
  createdAt: Date;
  lastEditedAt: Date;
}

export interface NotaBlock {
  id: string;
  type: string;
  content: string;
  children: NotaBlock[];
}
