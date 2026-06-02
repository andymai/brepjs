export interface ProjectSpec {
  readonly name: string;
  readonly description?: string;
  /**
   * Optional stable, globally-unique project identifier used to scope all derived
   * GlobalIds. Supply a UUID (or any stable unique string) when the model will be
   * federated/diffed/exported to COBie/BCF so its GlobalIds are unique across
   * models. When omitted, the scope falls back to the project name+description
   * (stable, but unique only per distinct name).
   */
  readonly projectId?: string;
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
