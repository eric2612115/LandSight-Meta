/** The API contract of docs/API.md, as the frontend reads it. */

export type Verdict =
  | 'drawing_vector' | 'drawing_raster' | 'drawing_image' | 'bill' | 'quote' | 'spec' | 'presentation'
  | 'backup_ignored' | 'archive_unpacked' | 'unsupported' | 'unreadable'

export type Source = 'geometry' | 'spark' | 'sam' | 'rule' | 'bill'

export type FileVerdict = {
  file_id: string
  path: string
  name: string
  ext: string
  size_bytes: number
  verdict: Verdict
  decided_by: 'ext' | 'content' | 'spark'
  why: string
  sheet_id?: string
  children?: string[]
}

export type ObjectKind =
  | 'tree' | 'existing_tree' | 'hedge' | 'shrub_bed' | 'lawn' | 'paving' | 'planter_edge' | 'legend'
  | 'title_block' | 'schedule' | 'fire_lane' | 'boundary' | 'match_line'

export type DrawingObject = {
  object_id: string
  kind: ObjectKind
  label?: string
  species_code?: string
  centre?: [number, number]
  area_m2?: number
  length_m?: number
  outline: number[][]
  closed: boolean
  gaps?: [number, number][]
  by: 'geometry' | 'spark' | 'sam'
  excluded?: { reason: string; rule?: string }
}

export type Bounds = { min_x: number; min_y: number; max_x: number; max_y: number }

export type Sheet = {
  sheet_id: string
  file_id: string
  title: string
  number: string
  kind: 'plan' | 'elevation' | 'detail' | 'schedule' | 'legend' | 'cover' | 'background'
  kind_confidence: number
  kind_by: 'spark' | 'rule'
  kind_why: string
  revision?: string
  date?: string
  scale_title?: string
  scale_measured?: string
  counted: boolean
  not_counted_reason?: string
  svg_url: string
  png_url: string
  bounds: Bounds
  objects: DrawingObject[]
  /** extension: the coloured rendering SAM 3.1 reads */
  filled_png_url?: string
}

export type SparkView = {
  crop_url: string
  object_id?: string
  answer: Record<string, unknown>
  why: string
  confidence: number
  points?: [number, number][]
  /** the same points as fractions (0..1) of the crop, when the backend gives them */
  points_crop?: [number, number][]
}

export type Item = {
  item_id: string
  kind: ObjectKind
  label: string
  species_code?: string
  unit: 'plant' | 'm2' | 'm'
  geometry_count?: number
  spark_count?: number
  schedule_count?: number
  label_count?: number
  agreed: boolean
  flagged_reason?: string
  quote_count?: number
  object_ids: string[]
  sheet_ids: string[]
  spark?: SparkView
  confirmed?: boolean
  botanical?: string
  proposed_count?: number
}

export type Severity = 'flag' | 'fail' | 'review' | 'info'

export type Check = {
  check_id: string
  category:
    | 'quantity' | 'revision' | 'sheet' | 'area' | 'scale' | 'bill' | 'price' | 'arithmetic' | 'units'
    | 'regulation' | 'protected_tree' | 'ingest' | 'document'
  title: string
  severity: Severity
  by: Source[]
  why: string
  evidence: { file_ids?: string[]; sheet_ids?: string[]; object_ids?: string[]; cells?: string[] }
  citation?: { article: string; url: string; gloss: string }
  numbers?: Record<string, unknown>
  fixes?: { label: string; result: number | string; passes: boolean; object_ids?: string[]; alpha?: number; extra_trees?: number }[]
}

export type ErrorScore = { planted: number; found: string[]; flagged: string[]; missed: string[]; false_alarms: string[] }

export type TallyRow = {
  label: string
  species_code?: string
  drawn: number
  spark: number
  schedule: number
  unit: string
  status: 'agreed' | 'flagged' | 'confirmed'
  item_id?: string
}

export type Run = {
  run_id: string
  package: { name: string; folder: string; file_count: number }
  files: FileVerdict[]
  sheets: Sheet[]
  items: Item[]
  checks: Check[]
  errors: ErrorScore
  tally: TallyRow[]
  timing: { total_s: number; spark_calls: number; sam_calls: number }
}

export type SceneId = 'drop' | 'wake' | 'eye' | 'hedge' | 'colour' | 'gauge' | 'bill' | 'callback'

export type Scene = {
  id: SceneId
  title: string
  sheet_id?: string
  focus?: string[]
  check_ids?: string[]
  item_ids?: string[]
  sheet_ids?: string[]
  duration_s: number
}

export type Health = { ok: boolean; spark: 'fixtures' | 'live'; version: string }
