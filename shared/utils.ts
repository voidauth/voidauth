export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type RemoveKeys<T, K extends keyof T> = Omit<T, K> & {[k in K]?: undefined};

export type Nullable<T> = { [K in keyof T]: T[K] | null }
