// Had to disable the lint rule because isServer type is defined as false
// in solid-js/web package. I'll create a GitHub issue with them to see
// why that happens.
import { hydrate, notifyManager } from '@tanstack/query-core'
import { isServer } from 'solid-js/web'
import {
  createComputed,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
} from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import { useQueryClient } from './QueryClientProvider'
import { shouldThrowError } from './utils'
import { useIsRestoring } from './isRestoring'
import type { CreateBaseQueryOptions } from './types'
import type { Accessor, Signal } from 'solid-js'
import type { QueryClient } from './QueryClient'
import type {
  InfiniteQueryObserverResult,
  Query,
  QueryKey,
  QueryObserver,
  QueryObserverResult,
  QueryState,
} from '@tanstack/query-core'

function reconcileFn<TData, TError>(
  store: QueryObserverResult<TData, TError>,
  result: QueryObserverResult<TData, TError>,
  reconcileOption:
    | string
    | false
    | ((oldData: TData | undefined, newData: TData) => TData),
): QueryObserverResult<TData, TError> {
  if (reconcileOption === false) return result
  if (typeof reconcileOption === 'function') {
    const newData = reconcileOption(store.data, result.data as TData)
    return { ...result, data: newData } as typeof result
  }
  const newData = reconcile(result.data, { key: reconcileOption })(store.data)
  return { ...result, data: newData } as typeof result
}

type HydratableQueryState<TData, TError> = QueryObserverResult<TData, TError> &
  QueryState<TData, TError> &
  InfiniteQueryObserverResult<TData, TError>

/**
 * Solid's `onHydrated` functionality will silently "fail" (hydrate with an empty object)
 * if the resource data is not serializable.
 */
const hydratableObserverResult = <
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TDataHydratable,
>(
  query: Query<TQueryFnData, TError, TData, TQueryKey>,
  result: QueryObserverResult<TDataHydratable, TError>,
) => {
  // Including the extra properties is only relevant on the server
  if (!isServer) return result as HydratableQueryState<TDataHydratable, TError>

  return {
    ...unwrap(result),

    // cast to refetch function should be safe, since we only remove it on the server,
    // and refetch is not relevant on the server
    refetch: undefined as unknown as HydratableQueryState<
      TDataHydratable,
      TError
    >['refetch'],

    // cast to fetchNextPage function should be safe, since we only remove it on the server,
    fetchNextPage: undefined as unknown as HydratableQueryState<
      TDataHydratable,
      TError
    >['fetchNextPage'],

    // cast to fetchPreviousPage function should be safe, since we only remove it on the server,
    fetchPreviousPage: undefined as unknown as HydratableQueryState<
      TDataHydratable,
      TError
    >['fetchPreviousPage'],

    // hydrate() expects a QueryState object, which is similar but not
    // quite the same as a QueryObserverResult object. Thus, for now, we're
    // copying over the missing properties from state in order to support hydration
    dataUpdateCount: query.state.dataUpdateCount,
    fetchFailureCount: query.state.fetchFailureCount,
    isInvalidated: query.state.isInvalidated,

    // Unsetting these properties on the server since they might not be serializable
    fetchFailureReason: null,
    fetchMeta: null,
  } as HydratableQueryState<TDataHydratable, TError>
}

// class QueryObserverResultInternal<TData, TError> {
//   data: Signal<QueryObserverResult<TData, TError>['data']>
//   dataUpdatedAt: Signal<QueryObserverResult<TData, TError>['dataUpdatedAt']>
//   error: Signal<QueryObserverResult<TData, TError>['error']>
//   errorUpdatedAt: Signal<QueryObserverResult<TData, TError>['errorUpdatedAt']>
//   errorUpdateCount: Signal<
//     QueryObserverResult<TData, TError>['errorUpdateCount']
//   >
//   failureCount: Signal<QueryObserverResult<TData, TError>['failureCount']>
//   failureReason: Signal<QueryObserverResult<TData, TError>['failureReason']>
//   fetchStatus: Signal<QueryObserverResult<TData, TError>['fetchStatus']>
//   isError: Signal<QueryObserverResult<TData, TError>['isError']>
//   isFetched: Signal<QueryObserverResult<TData, TError>['isFetched']>
//   isFetchedAfterMount: Signal<
//     QueryObserverResult<TData, TError>['isFetchedAfterMount']
//   >
//   isFetching: Signal<QueryObserverResult<TData, TError>['isFetching']>
//   isLoading: Signal<QueryObserverResult<TData, TError>['isLoading']>
//   isLoadingError: Signal<QueryObserverResult<TData, TError>['isLoadingError']>
//   isPaused: Signal<QueryObserverResult<TData, TError>['isPaused']>
//   isPending: Signal<QueryObserverResult<TData, TError>['isPending']>
//   isPlaceholderData: Signal<
//     QueryObserverResult<TData, TError>['isPlaceholderData']
//   >
//   isRefetchError: Signal<QueryObserverResult<TData, TError>['isRefetchError']>
//   isRefetching: Signal<QueryObserverResult<TData, TError>['isRefetching']>
//   isStale: Signal<QueryObserverResult<TData, TError>['isStale']>
//   isSuccess: Signal<QueryObserverResult<TData, TError>['isSuccess']>
//   refetch: Signal<QueryObserverResult<TData, TError>['refetch']>
//   status: Signal<QueryObserverResult<TData, TError>['status']>

//   value = {
//     get data() {
//       return this.data[0]()
//     },
//     get dataUpdatedAt() {
//       return this.dataUpdatedAt[0]()
//     },
//   }

//   constructor(result: QueryObserverResult<TData, TError>) {
//     this.data = createSignal(result.data)
//     this.dataUpdatedAt = createSignal(result.dataUpdatedAt)
//     this.error = createSignal(result.error)
//     this.errorUpdatedAt = createSignal(result.errorUpdatedAt)
//     this.errorUpdateCount = createSignal(result.errorUpdateCount)
//     this.failureCount = createSignal(result.failureCount)
//     this.failureReason = createSignal(result.failureReason)
//     this.fetchStatus = createSignal(result.fetchStatus)
//     this.isError = createSignal(result.isError)
//     this.isFetched = createSignal(result.isFetched)
//     this.isFetchedAfterMount = createSignal(result.isFetchedAfterMount)
//     this.isFetching = createSignal(result.isFetching)
//     this.isLoading = createSignal(result.isLoading)
//     this.isLoadingError = createSignal(result.isLoadingError)
//     this.isPaused = createSignal(result.isPaused)
//     this.isPending = createSignal(result.isPending)
//     this.isPlaceholderData = createSignal(result.isPlaceholderData)
//     this.isRefetchError = createSignal(result.isRefetchError)
//     this.isRefetching = createSignal(result.isRefetching)
//     this.isStale = createSignal(result.isStale)
//     this.isSuccess = createSignal(result.isSuccess)
//     this.refetch = createSignal(result.refetch)
//     this.status = createSignal(result.status)
//   }

//   getValue() {
//     return this.value
//   }
//   // get data() {
//   //   return this.#data[0]()
//   // }

//   // get dataUpdatedAt() {
//   //   return this.#dataUpdatedAt[0]()
//   // }

//   // get error() {
//   //   return this.#error[0]()
//   // }

//   // get errorUpdatedAt() {
//   //   return this.#errorUpdatedAt[0]()
//   // }

//   // get errorUpdateCount() {
//   //   return this.#errorUpdateCount[0]()
//   // }
// }

function createQueryResultInternal<TData, TError>(
  result: QueryObserverResult<TData, TError>,
) {
  const data = createSignal(result.data)
  const dataUpdatedAt = createSignal(result.dataUpdatedAt)
  const error = createSignal(result.error)
  const errorUpdatedAt = createSignal(result.errorUpdatedAt)
  const errorUpdateCount = createSignal(result.errorUpdateCount)
  const failureCount = createSignal(result.failureCount)
  const failureReason = createSignal(result.failureReason)
  const fetchStatus = createSignal(result.fetchStatus)
  const isError = createSignal(result.isError)
  const isFetched = createSignal(result.isFetched)
  const isFetchedAfterMount = createSignal(result.isFetchedAfterMount)
  const isFetching = createSignal(result.isFetching)
  const isLoading = createSignal(result.isLoading)
  const isLoadingError = createSignal(result.isLoadingError)
  const isPaused = createSignal(result.isPaused)
  const isPending = createSignal(result.isPending)
  const isPlaceholderData = createSignal(result.isPlaceholderData)
  const isRefetchError = createSignal(result.isRefetchError)
  const isRefetching = createSignal(result.isRefetching)
  const isStale = createSignal(result.isStale)
  const isSuccess = createSignal(result.isSuccess)
  const refetch = createSignal(result.refetch)
  const status = createSignal(result.status)
  const isInitialLoading = createSignal(result.isInitialLoading)

  const value = {
    get data() {
      return data[0]()
    },
    get dataUpdatedAt() {
      return dataUpdatedAt[0]()
    },
    get error() {
      return error[0]()
    },
    get errorUpdatedAt() {
      return errorUpdatedAt[0]()
    },
    get errorUpdateCount() {
      return errorUpdateCount[0]()
    },
    get failureCount() {
      return failureCount[0]()
    },
    get failureReason() {
      return failureReason[0]()
    },
    get fetchStatus() {
      return fetchStatus[0]()
    },
    get isError() {
      return isError[0]()
    },
    get isFetched() {
      return isFetched[0]()
    },
    get isFetchedAfterMount() {
      return isFetchedAfterMount[0]()
    },
    get isFetching() {
      return isFetching[0]()
    },
    get isLoading() {
      return isLoading[0]()
    },
    get isLoadingError() {
      return isLoadingError[0]()
    },
    get isPaused() {
      return isPaused[0]()
    },
    get isPending() {
      return isPending[0]()
    },
    get isPlaceholderData() {
      return isPlaceholderData[0]()
    },
    get isRefetchError() {
      return isRefetchError[0]()
    },
    get isRefetching() {
      return isRefetching[0]()
    },
    get isStale() {
      return isStale[0]()
    },
    get isSuccess() {
      return isSuccess[0]()
    },
    get refetch() {
      return refetch[0]()
    },
    get status() {
      return status[0]()
    },
    get isInitialLoading() {
      return isInitialLoading[0]()
    },
  }

  const setValue = (newResult: QueryObserverResult<TData, TError>) => {
    data[1](() => newResult.data)
    dataUpdatedAt[1](newResult.dataUpdatedAt)
    error[1](() => newResult.error)
    errorUpdatedAt[1](newResult.errorUpdatedAt)
    errorUpdateCount[1](newResult.errorUpdateCount)
    failureCount[1](newResult.failureCount)
    failureReason[1](() => newResult.failureReason)
    fetchStatus[1](newResult.fetchStatus)
    isError[1](newResult.isError)
    isFetched[1](newResult.isFetched)
    isFetchedAfterMount[1](newResult.isFetchedAfterMount)
    isFetching[1](newResult.isFetching)
    isLoading[1](newResult.isLoading)
    isLoadingError[1](newResult.isLoadingError)
    isPaused[1](newResult.isPaused)
    isPending[1](newResult.isPending)
    isPlaceholderData[1](newResult.isPlaceholderData)
    isRefetchError[1](newResult.isRefetchError)
    isRefetching[1](newResult.isRefetching)
    isStale[1](newResult.isStale)
    isSuccess[1](newResult.isSuccess)
    refetch[1](() => newResult.refetch)
    status[1](newResult.status)
    isInitialLoading[1](newResult.isInitialLoading)
  }

  return {
    getValue(): QueryObserverResult<TData, TError> {
      // @ts-expect-error - This is a valid return value
      return value
    },
    setValue,
  }
}

// Base Query Function that is used to create the query.
export function createBaseQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  options: Accessor<
    CreateBaseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
  >,
  Observer: typeof QueryObserver,
  queryClient?: Accessor<QueryClient>,
) {
  type ResourceData =
    | HydratableQueryState<TData, TError>
    | QueryObserverResult<TData, TError>

  const client = createMemo(() => useQueryClient(queryClient?.()))
  const isRestoring = useIsRestoring()

  const defaultedOptions = createMemo(() => {
    const defaultOptions = client().defaultQueryOptions(options())
    defaultOptions._optimisticResults = isRestoring()
      ? 'isRestoring'
      : 'optimistic'
    defaultOptions.structuralSharing = false
    if (isServer) {
      defaultOptions.retry = false
      defaultOptions.throwOnError = true
    }
    return defaultOptions
  })

  const [observer, setObserver] = createSignal(
    new Observer(client(), defaultedOptions()),
  )

  const state = createQueryResultInternal(
    observer().getOptimisticResult(defaultedOptions()),
  )

  const createServerSubscriber = (
    resolve: (
      data: ResourceData | PromiseLike<ResourceData | undefined> | undefined,
    ) => void,
    reject: (reason?: any) => void,
  ) => {
    return observer().subscribe((result) => {
      notifyManager.batchCalls(() => {
        const query = observer().getCurrentQuery()
        const unwrappedResult = hydratableObserverResult(query, result)

        if (unwrappedResult.isError) {
          reject(unwrappedResult.error)
        } else {
          resolve(unwrappedResult)
        }
      })()
    })
  }

  const createClientSubscriber = () => {
    const obs = observer()
    return obs.subscribe((result) => {
      notifyManager.batchCalls(() => {
        // @ts-expect-error - This will error because the reconcile option does not
        // exist on the query-core QueryObserverResult type
        const reconcileOptions = obs.options.reconcile

        // If the query has data we don't suspend but instead mutate the resource
        // This could happen when placeholderData/initialData is defined
        if (queryResource()?.data && result.data && !queryResource.loading) {
          state.setValue(result)
          mutate(state.getValue())
        } else {
          state.setValue(result)
          refetch()
        }
      })()
    })
  }

  /**
   * Unsubscribe is set lazily, so that we can subscribe after hydration when needed.
   */
  let unsubscribe: (() => void) | null = null

  const [queryResource, { refetch, mutate }] = createResource<
    ResourceData | undefined
  >(
    () => {
      const obs = observer()
      return new Promise((resolve, reject) => {
        if (isServer) {
          unsubscribe = createServerSubscriber(resolve, reject)
        } else if (!unsubscribe && !isRestoring()) {
          unsubscribe = createClientSubscriber()
        }
        obs.updateResult()

        if (!state.getValue().isLoading) {
          const query = obs.getCurrentQuery()
          resolve(hydratableObserverResult(query, state.getValue()))
        }
      })
    },
    {
      initialValue: state.getValue(),

      // If initialData is provided, we resolve the resource immediately
      get ssrLoadFrom() {
        return options().initialData ? 'initial' : 'server'
      },

      get deferStream() {
        return options().deferStream
      },

      /**
       * If this resource was populated on the server (either sync render, or streamed in over time), onHydrated
       * will be called. This is the point at which we can hydrate the query cache state, and setup the query subscriber.
       *
       * Leveraging onHydrated allows us to plug into the async and streaming support that solidjs resources already support.
       *
       * Note that this is only invoked on the client, for queries that were originally run on the server.
       */
      onHydrated(_k, info) {
        const defaultOptions = defaultedOptions()
        if (info.value) {
          hydrate(client(), {
            queries: [
              {
                queryKey: defaultOptions.queryKey,
                queryHash: defaultOptions.queryHash,
                state: info.value,
              },
            ],
          })
        }

        if (unsubscribe) return
        /**
         * Do not refetch query on mount if query was fetched on server,
         * even if `staleTime` is not set.
         */
        const newOptions = { ...defaultOptions }
        if (defaultOptions.staleTime || !defaultOptions.initialData) {
          newOptions.refetchOnMount = false
        }
        // Setting the options as an immutable object to prevent
        // wonky behavior with observer subscriptions
        observer().setOptions(newOptions)
        state.setValue(observer().getOptimisticResult(newOptions))
        unsubscribe = createClientSubscriber()
      },
    },
  )

  createComputed(
    on(
      client,
      (c) => {
        if (unsubscribe) {
          unsubscribe()
        }
        const newObserver = new Observer(c, defaultedOptions())
        unsubscribe = createClientSubscriber()
        setObserver(newObserver)
      },
      {
        defer: true,
      },
    ),
  )

  createComputed(() => {
    if (!isRestoring()) {
      refetch()
    }
  })

  onCleanup(() => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  createComputed(
    on(
      [observer, defaultedOptions],
      ([obs, opts]) => {
        obs.setOptions(opts)
        state.setValue(obs.getOptimisticResult(opts))
      },
      { defer: true },
    ),
  )

  createComputed(
    on(
      () => state.getValue().status,
      () => {
        const obs = observer()
        if (
          state.getValue().isError &&
          !state.getValue().isFetching &&
          !isRestoring() &&
          shouldThrowError(obs.options.throwOnError, [
            state.getValue().error!,
            obs.getCurrentQuery(),
          ])
        ) {
          throw state.getValue().error
        }
      },
    ),
  )

  const handler = {
    get(
      target: QueryObserverResult<TData, TError>,
      prop: keyof QueryObserverResult<TData, TError>,
    ): any {
      const val = queryResource()?.[prop]
      return val !== undefined ? val : Reflect.get(target, prop)
    },
  }

  return new Proxy(state.getValue(), handler)
}
