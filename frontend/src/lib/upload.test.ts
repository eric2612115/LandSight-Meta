import { describe, expect, it } from 'vitest'
import { capMessage, CAPS, formOf, fromInput, isLoneZip, MB, readAll, uploadingLine, walkEntries, type Picked } from './upload'

/** A fake FileSystemFileEntry / FileSystemDirectoryEntry, as Chrome hands them to webkitGetAsEntry: a directory's
 * reader answers at most `batch` entries per readEntries call, then an empty batch. */
const fileEntry = (name: string, size = 1): FileSystemFileEntry =>
  ({ isFile: true, isDirectory: false, name, file: (ok: (f: File) => void) => ok(new File([new Uint8Array(size)], name)) }) as unknown as FileSystemFileEntry
const dirEntry = (name: string, children: FileSystemEntry[], batch = 100, calls: number[] = []): FileSystemDirectoryEntry =>
  ({
    isFile: false, isDirectory: true, name,
    createReader: () => {
      let at = 0
      return { readEntries: (ok: (xs: FileSystemEntry[]) => void) => { const xs = children.slice(at, at + batch); at += xs.length; calls.push(xs.length); ok(xs) } }
    },
  }) as unknown as FileSystemDirectoryEntry

const picked = (path: string, size = 1): Picked => ({ file: new File([new Uint8Array(size)], path.split('/').pop()!), path })
const big = (path: string, size: number): Picked => ({ file: { size, name: path } as File, path })

describe('the walk of a dropped folder', () => {
  it('reads nested folders into relative paths with the top folder included, sorted, hidden files left out', async () => {
    const top = dirEntry('greenfield', [
      fileEntry('answer_key.json'),
      fileEntry('.DS_Store'),
      dirEntry('Greenfield Residences — Landscape Package', [
        dirEntry('Drawings', [fileEntry('L-1 Planting Plan (Rev B).dxf'), fileEntry('._L-1 Planting Plan (Rev B).dxf'), fileEntry('L-0.pdf')]),
        dirEntry('Billss', [fileEntry('BOQ - Landscape - r3.xlsx'), fileEntry('Thumbs.db')]),
        dirEntry('empty', []),
      ]),
    ])
    const out = await walkEntries([top])
    expect(out.map((x) => x.path)).toEqual([
      'greenfield/Greenfield Residences — Landscape Package/Drawings/L-0.pdf',
      'greenfield/Greenfield Residences — Landscape Package/Drawings/L-1 Planting Plan (Rev B).dxf',
      'greenfield/Greenfield Residences — Landscape Package/Billss/BOQ - Landscape - r3.xlsx',
      'greenfield/answer_key.json',
    ])
    expect(out.every((x) => x.file instanceof File)).toBe(true)
  })

  it('asks readEntries again until it answers an empty batch: 250 files come in 100 + 100 + 50 + 0', async () => {
    const calls: number[] = []
    const many = dirEntry('big', Array.from({ length: 250 }, (_, i) => fileEntry(`f${String(i).padStart(3, '0')}.pdf`)), 100, calls)
    expect((await readAll(many)).length).toBe(250)
    expect(calls).toEqual([100, 100, 50, 0])
    const out = await walkEntries([many])
    expect(out.length).toBe(250)
    expect(out[0].path).toBe('big/f000.pdf')
    expect(out[249].path).toBe('big/f249.pdf')
  })

  it('normalises names to NFC (a macOS folder arrives decomposed)', async () => {
    const nfd = 'Café Plan.dxf' // e + combining acute, as HFS+/APFS hand it over
    const out = await walkEntries([dirEntry('pkg', [fileEntry(nfd)])])
    expect(out[0].path).toBe('pkg/Café Plan.dxf')
    expect(out[0].path.normalize('NFC')).toBe(out[0].path)
    expect(out[0].path).not.toBe(`pkg/${nfd}`)
  })

  it('the click path: <input webkitdirectory> files keep their webkitRelativePath, hidden ones left out', () => {
    const f = (rel: string) => { const x = new File([new Uint8Array(1)], rel.split('/').pop()!); Object.defineProperty(x, 'webkitRelativePath', { value: rel }); return x }
    const out = fromInput([f('greenfield/b.pdf'), f('greenfield/.DS_Store'), f('greenfield/sub/a.dxf'), f('greenfield/.git/config')])
    expect(out.map((x) => x.path)).toEqual(['greenfield/b.pdf', 'greenfield/sub/a.dxf'])
  })

  it('a lone .zip is not a folder; a .zip inside one is just a file', () => {
    expect(isLoneZip([{ isFile: true, name: 'package.zip' }])).toBe(true)
    expect(isLoneZip([{ isFile: false, name: 'package' }])).toBe(false)
    expect(isLoneZip([{ isFile: true, name: 'a.zip' }, { isFile: true, name: 'b.pdf' }])).toBe(false)
  })
})

describe('the caps, checked before a byte is sent, in the server’s words', () => {
  it('passes a folder that fits, and names the cap that does not', () => {
    expect(capMessage([picked('g/a.pdf'), picked('g/b.pdf')])).toBeNull()
    expect(capMessage([])).toBe('an empty upload: no file parts (send one part per file of the dropped folder)')
    expect(capMessage(Array.from({ length: 501 }, (_, i) => picked(`g/f${i}.pdf`)))).toBe('too many files: the cap is 500 files per upload')
    expect(capMessage(Array.from({ length: 500 }, (_, i) => picked(`g/f${i}.pdf`)))).toBeNull()
    expect(capMessage([big('g/scan.pdf', 50 * MB + 1)])).toBe("file too large: 'g/scan.pdf' passes the 50 MB per-file cap")
    expect(capMessage([big('g/a.pdf', 50 * MB), big('g/b.pdf', 50 * MB), big('g/c.pdf', 1)])).toBe("upload too large: the 100 MB total cap is passed at 'g/c.pdf'")
    expect(capMessage([big('g/a.pdf', 50 * MB), big('g/b.pdf', 50 * MB)])).toBeNull()
    expect(CAPS).toEqual({ files: 500, perFile: 50 * MB, total: 100 * MB })
  })

  it('says what is being uploaded', () => {
    expect(uploadingLine([big('g/a.pdf', 10 * MB), big('g/b.dxf', 4.2 * MB)])).toBe('Uploading 2 files (14.2 MB)…')
    expect(uploadingLine([big('g/a.pdf', 1)])).toBe('Uploading 1 file (0.0 MB)…')
  })
})

describe('the multipart body', () => {
  it('sends one `files` part per file whose filename is the relative path, NFC', () => {
    const fd = formOf([picked('greenfield/answer_key.json'), picked('greenfield/Drawings/L-1 Planting Plan (Rev B).dxf'), { file: new File(['x'], 'x'), path: 'pkg/Café.pdf' }])
    const parts = fd.getAll('files') as File[]
    expect(parts.length).toBe(3)
    expect(parts.map((p) => p.name)).toEqual(['greenfield/answer_key.json', 'greenfield/Drawings/L-1 Planting Plan (Rev B).dxf', 'pkg/Café.pdf'])
    expect([...fd.keys()].every((k) => k === 'files')).toBe(true)
  })
})
