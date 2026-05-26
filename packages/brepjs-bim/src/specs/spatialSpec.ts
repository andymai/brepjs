export interface ProjectSpec {
  readonly name: string;
  readonly description?: string;
}

export interface SiteSpec {
  readonly name: string;
  readonly description?: string;
}

export interface BuildingSpec {
  readonly name: string;
  readonly description?: string;
}

export interface StoreySpec {
  readonly name: string;
  readonly elevation: number; // mm above site datum
}
