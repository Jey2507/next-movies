import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabaseClient'

const ACTIVE_LIST_KEY = 'watch-queue-active-list'

// A personal list + membership row is created automatically for every new
// account by the `handle_new_user` trigger in schema.sql. That list is
// permanently private — it has no invite code and can never be joined (see
// schema.sql). To watch something together, createSharedList() below makes
// a brand-new, separate list; sharing its code invites people into *that*
// list, never into anyone's personal one. Everyone inside a shared list has
// equal rights (see schema.sql's RLS policies: no owner-only permissions).
export function useLists(user) {
  const [lists, setLists] = useState([])
  const [listsLoading, setListsLoading] = useState(!!user)
  const [activeListId, setActiveListIdState] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_LIST_KEY) || null
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      return null
    }
  })
  const [joinError, setJoinError] = useState('')
  const [listsError, setListsError] = useState('')
  const [createError, setCreateError] = useState('')
  const [leaveError, setLeaveError] = useState('')

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLists([])
      setListsLoading(false)
      return
    }
    setListsLoading(true)
    // Ordered by *this user's* list_members.joined_at, not the list's own
    // created_at — a shared list can have existed for a while before you
    // joined it (e.g. a friend's list), so sorting by the list's own
    // created_at could put it ahead of your own, more recently created,
    // personal list. joined_at reflects your own timeline instead.
    const { data: memberRows, error } = await supabase
      .from('list_members')
      .select('joined_at, lists (id, name, invite_code, owner_id, is_personal, created_at)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
    if (error || !memberRows) {
      // Surfaced instead of silently rendering an empty switcher — the
      // most likely cause is schema.sql not having been (re-)run against
      // this project yet, e.g. after the `is_personal` column was added.
      setListsError(error?.message || 'Could not load your lists.')
      setLists([])
      setListsLoading(false)
      return
    }
    setListsError('')
    const listRows = memberRows.map((r) => r.lists).filter(Boolean)

    const listIds = listRows.map((l) => l.id)
    let membersByList = new Map()
    if (listIds.length) {
      const { data: memberRows } = await supabase
        .from('list_members')
        .select('list_id, user_id, profiles(display_name)')
        .in('list_id', listIds)
      if (memberRows) {
        membersByList = memberRows.reduce((map, row) => {
          const names = map.get(row.list_id) || []
          names.push(row.profiles?.display_name || '—')
          map.set(row.list_id, names)
          return map
        }, new Map())
      }
    }

    const withLabels = listRows.map((list) => {
      const names = membersByList.get(list.id) || []
      const label = list.is_personal
        ? 'Personal'
        : list.name || (names.length ? names.join(' & ') : 'Shared list')
      return { ...list, memberNames: names, label }
    })

    setLists(withLabels)
    setListsLoading(false)
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // Keep the active list valid as the membership list changes (e.g. right
  // after signing in, or after joining a shared list).
  useEffect(() => {
    if (!lists.length) return
    if (activeListId && lists.some((l) => l.id === activeListId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveListIdState(lists[0].id)
  }, [lists, activeListId])

  function setActiveListId(id) {
    setActiveListIdState(id)
    try {
      localStorage.setItem(ACTIVE_LIST_KEY, id)
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // ignore write failures
    }
  }

  // Starts a brand-new shared list (never the caller's personal one) with
  // just the caller as a member, so its freshly-generated invite code can
  // be handed to someone else. Switches to it once created.
  //
  // Goes through the create_shared_list() RPC rather than two separate
  // client-side inserts (lists, then list_members): inserting into `lists`
  // with `.select()` asks Postgres to RETURN the new row, which re-checks
  // it against lists_select's `is_list_member(id)` — false at that point,
  // since the matching list_members row is the *next*, separate call.
  // Postgres reports that exactly like an insert being rejected, even
  // though it was actually allowed. The RPC does both inserts server-side
  // and returns the id without going through the caller's RLS at all.
  async function createSharedList() {
    setCreateError('')
    if (!isSupabaseConfigured || !user) return null
    const { data: listId, error } = await supabase.rpc('create_shared_list')
    if (error || !listId) {
      console.error('createSharedList: create_shared_list RPC failed', error)
      setCreateError(error?.message || 'Could not create a shared list.')
      return null
    }
    await refresh()
    setActiveListId(listId)
    return listId
  }

  async function joinList(code) {
    setJoinError('')
    if (!code.trim()) return
    const { data, error } = await supabase.rpc('join_list_by_code', { p_code: code.trim() })
    if (error) {
      console.error('joinList: join_list_by_code failed', error)
      setJoinError(error.message.includes('Invalid invite code') ? 'Invalid invite code.' : error.message)
      return
    }
    await refresh()
    // join_list_by_code now returns a plain uuid, not a row/table (see
    // schema.sql) — data is that uuid directly.
    if (data) setActiveListId(data)
  }

  // Leaving is a plain self-row delete from list_members — already allowed
  // by the list_members_delete_self RLS policy, no RPC needed. If this was
  // the list's last member, a database trigger (see schema.sql) deletes
  // the now-empty list itself; the "keep active list valid" effect above
  // then hands activeListId to whatever's left (always at least the
  // caller's personal list).
  async function leaveList(listId) {
    setLeaveError('')
    if (!isSupabaseConfigured || !user) return
    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', user.id)
    if (error) {
      console.error('leaveList: delete from list_members failed', error)
      setLeaveError(error.message)
      return
    }
    await refresh()
  }

  const activeList = lists.find((l) => l.id === activeListId) || null

  return {
    lists,
    listsLoading,
    listsError,
    activeListId,
    activeList,
    setActiveListId,
    createSharedList,
    createError,
    joinList,
    joinError,
    leaveList,
    leaveError,
  }
}
