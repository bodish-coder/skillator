import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import { closeForm } from './assign'
import { runCall } from './lib/host'
import { cleanIntakeText, draftEdit, firstDraft, intakeDetails, intakeImportArgs, newIntakePaths } from './lib/intake'
import type { Draft, IntakePaths } from './lib/intake'
import { say } from './logtab'

const intakeA = atom({ plugin: 'ops-board', key: 'intake' } as const, null)
type View = { draft?: Draft; paths?: IntakePaths; edit?: { title: string; description: string }; busy?: boolean; picking?: boolean }

export async function openIntake($: EngineInterface) {
  const r = await runCall($, 'meta-intake', ['list'])
  if (r.code !== 0) { say($, r.err.trim() || 'Could not read the intake queue'); return }
  let draft: Draft | undefined
  try { draft = firstDraft(r.out) } catch { say($, 'Could not read the intake queue'); return }
  await update($, intakeA, () => draft ? { draft } : { paths: newIntakePaths() })
  await $.ui.open({ id: 'ops-board', title: 'ops board', closeOnEscape: true })
}

export async function renderIntake($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const view: View | null = await read($, intakeA)
  if (!view) return null
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : null
  const d = view.draft
  if (view.paths || !d) {
    const paths = view.paths ?? newIntakePaths()
    const setPath = (key: keyof IntakePaths) => (text: string) =>
      void update($, intakeA, v => v?.paths && !v.busy ? { ...v, paths: { ...v.paths, [key]: text } } : v)
    const fileAction = async (action: 'pick' | 'samples' | 'import', key: keyof IntakePaths = 'file') => {
      const current: View | null = await read($, intakeA)
      if (!current?.paths || current.busy) return
      await update($, intakeA, v => v && { ...v, busy: true, picking: action === 'pick' })
      try {
        const args = action === 'import' ? intakeImportArgs(current.paths) : action === 'samples'
          ? ['samples', current.paths.folder.trim()] : ['pick', key]
        const r = await runCall($, action === 'import' ? 'meta-intake' : 'intake-files', args)
        if (r.code !== 0) throw new Error(r.err.trim() || 'Intake file action failed')
        if (action === 'import') {
          const list = await runCall($, 'meta-intake', ['list'])
          if (list.code !== 0) throw new Error(list.err.trim() || 'Could not read the intake queue')
          const draft = firstDraft(list.out)
          await update($, intakeA, v => v && { ...v, draft, paths: draft ? undefined : v.paths })
          say($, 'Import finished. Review queued drafts before approval.')
        } else {
          const result: string | null = JSON.parse(r.out)
          if (action === 'samples') say($, 'Samples saved in ' + cleanIntakeText(result ?? ''))
          else if (result) await update($, intakeA, v => v?.paths ? { ...v, paths: { ...v.paths, [key]: result } } : v)
        }
      } catch (error) {
        say($, error instanceof Error ? error.message : String(error))
      } finally {
        await update($, intakeA, v => v && { ...v, busy: false, picking: false })
      }
    }
    return <Box flexDirection="column">
      <Box key="form:title"><Text bold>Intake files</Text></Box>
      {(['file', 'mapping', 'folder'] as const).map((key, i) =>
        <Box key={'intake:paths:' + key} flexDirection="row" flexWrap="wrap" gap={1}>
          {Input && <Input key={'intake:path:' + key} label={['Intake file', 'Optional mapping', 'Sample folder'][i]} value={paths[key]} onInput={setPath(key)} onSubmit={setPath(key)} />}
          {!Input && paths[key] && <Text wrap="wrap">{cleanIntakeText(paths[key])}</Text>}
          {!view.busy && <Button key={'intake:browse:' + key} plain onPress={() => { void fileAction('pick', key) }}>{['Browse files', 'Browse mapping', 'Choose folder'][i]}</Button>}
        </Box>)}
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {view.busy && <Text dimColor>{view.picking ? 'Select a path in the Windows dialog.' : 'Working…'}</Text>}
        {!view.busy && paths.file.trim() && <Button key="intake:import" plain onPress={() => { void fileAction('import') }}>Import drafts</Button>}
        {!view.busy && paths.folder.trim() && <Button key="intake:samples" plain onPress={() => { void fileAction('samples') }}>Generate samples</Button>}
        {!view.busy && d && <Button key="intake:review" plain onPress={() => { void update($, intakeA, v => v && { ...v, paths: undefined }) }}>Review draft</Button>}
        <Button key="intake:close" plain onPress={() => { void closeForm($) }}>Close</Button>
      </Box>
    </Box>
  }
  const edit = view.edit
  const set = (key: 'title' | 'description') => (text: string) =>
    void update($, intakeA, v => v?.edit ? { ...v, edit: { ...v.edit, [key]: text } } : v)
  const act = async (action: 'accept' | 'reject' | 'edit') => {
    const current: View | null = await read($, intakeA)
    if (!current || current.busy || current.draft?.revision !== d.revision) return
    await update($, intakeA, v => v && { ...v, busy: true })
    const args = [action, d.id, d.revision]
    if (action === 'edit' && current.edit) args.push(draftEdit(current.edit.title, current.edit.description))
    const r = await runCall($, 'meta-intake', args)
    if (r.code !== 0) {
      await update($, intakeA, v => v && { ...v, busy: false })
      say($, r.err.trim() || 'Intake decision failed')
      return
    }
    await closeForm($)
    say($, action === 'accept' ? 'Accepted as ' + r.out.trim()
      : action === 'reject' ? 'Intake draft rejected' : 'Intake draft edited. Reopen to review and approve.')
  }
  return <Box flexDirection="column">
    <Box key="form:title"><Text bold>Intake draft</Text></Box>
    <Text wrap="wrap">{(d.type === 'B' ? 'Bug: ' : 'Feature: ') + cleanIntakeText(d.title)}</Text>
    {intakeDetails(d).map((text, i) => <Box key={'detail:' + i}><Text wrap="wrap">{text}</Text></Box>)}
    {Input && edit && <Input key="intake:title" label="Title" value={edit.title} onInput={set('title')} onSubmit={set('title')} />}
    {Input && edit && <Input key="intake:description" label="Description" value={edit.description} onInput={set('description')} onSubmit={set('description')} />}
    <Box flexDirection="row" flexWrap="wrap" gap={2}>
      {view.busy && <Text dimColor>Saving intake decision…</Text>}
      {!view.busy && edit && <Button key="intake:save" plain onPress={() => { void act('edit') }}>Save edit</Button>}
      {!view.busy && !edit && <Button key="intake:accept" plain hotkey="a" onPress={() => { void act('accept') }}>Accept</Button>}
      {!view.busy && !edit && !d.ticketId && Input && <Button key="intake:edit" plain hotkey="e" onPress={() => {
        void update($, intakeA, v => v && { ...v, edit: { title: d.title, description: d.description ?? '' } })
      }}>Edit</Button>}
      {!view.busy && !edit && !d.ticketId && <Button key="intake:reject" plain hotkey="x" onPress={() => { void act('reject') }}>Reject</Button>}
      {!view.busy && !edit && <Button key="intake:files" plain onPress={() => { void update($, intakeA, v => v && { ...v, paths: newIntakePaths() }) }}>Import files</Button>}
      <Button key="intake:close" plain onPress={() => { void closeForm($) }}>Close</Button>
    </Box>
  </Box>
}
