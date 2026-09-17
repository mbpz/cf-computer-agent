export const GRAPH_DEFAULT_DEPTH = 1 as const;
export const GRAPH_MAX_DEPTH = 2 as const;

export const GRAPH_MIN_LIMIT = 1 as const;
export const GRAPH_DEFAULT_LIMIT = 50 as const;
export const GRAPH_MAX_NODE_LIMIT = 100 as const;
export const GRAPH_MAX_EDGE_LIMIT = 200 as const;

// A query's limit applies to nodes. Graph responses allow up to two edges per
// requested node, matching the public default (50/100) and maximum (100/200).
export const GRAPH_DEFAULT_EDGE_LIMIT = GRAPH_DEFAULT_LIMIT * 2;
export const GRAPH_MAX_LIMIT = GRAPH_MAX_NODE_LIMIT;
