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
  /**
   * Optional geodetic coordinate reference system. When present the writer
   * emits IfcProjectedCRS + IfcMapConversion against the model context, which
   * establishes proper georeferencing (buildingSMART rule GRF003 asks for a
   * CRS whenever facilities such as buildings are modelled).
   */
  readonly crs?: ProjectCrs;
}

export interface ProjectCrs {
  /** CRS name, conventionally an EPSG code (e.g. "EPSG:25832"). */
  readonly name: string;
  readonly description?: string | undefined;
  readonly geodeticDatum?: string | undefined;
  readonly verticalDatum?: string | undefined;
  readonly mapProjection?: string | undefined;
  readonly mapZone?: string | undefined;
  /** Map coordinates of the model origin, in metres. Default 0. */
  readonly eastings?: number | undefined;
  readonly northings?: number | undefined;
  readonly orthogonalHeight?: number | undefined;
  /** Rotation of the model X axis in the map plane (abscissa/ordinate pair). */
  readonly xAxisAbscissa?: number | undefined;
  readonly xAxisOrdinate?: number | undefined;
  readonly scale?: number | undefined;
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
