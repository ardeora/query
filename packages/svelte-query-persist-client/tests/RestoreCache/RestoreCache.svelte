<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { sleep } from '../utils'
  import type { Writable } from 'svelte/store'
  import type { StatusResult } from '../utils'

  export let states: Writable<Array<StatusResult<string>>>

  const query = createQuery({
    queryKey: ['test'],
    queryFn: async () => {
      await sleep(10)
      return 'fetched'
    },
  })

  $: states.update((prev) => [...prev, $query])
</script>

<div>{$query.data}</div>
<div>fetchStatus: {$query.fetchStatus}</div>
