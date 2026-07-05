/**
 * TemplatesDialog — the document-template library modal (#600).
 *
 * One modal, two views:
 * - **list**: save the current document as a named template, and browse / apply
 *   / delete saved templates.
 * - **fill**: when an applied template has `{{variables}}`, swap the body for
 *   `TemplateFillForm` to map them (free text + corpus law metadata).
 *
 * Applying inserts the filled draft at the cursor (non-destructive — it never
 * silently wipes the current document). Portaled to `<body>` by EditorPage so
 * the fixed overlay isn't clipped by the editor's scroll container.
 *
 * --- WHERE TO CHANGE IF TEMPLATE STORAGE CHANGES ---
 * - Persistence → `@/lib/template-store`.
 * - Placeholder discovery / substitution → `./template-utils`.
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { LayoutTemplate, FilePlus2, Upload, Trash2, FileText } from 'lucide-react';
import { Button, Kbd } from '@/components/ui';
import { useTemplateStore } from '@/lib/template-store';
import { extractVariables, fillTemplate } from './template-utils';
import { importFile, SUPPORTED_IMPORT } from './import-utils';
import { TemplateFillForm } from './TemplateFillForm';

interface TemplatesDialogProps {
  editor: Editor;
  onClose: () => void;
}

export function TemplatesDialog({ editor, onClose }: TemplatesDialogProps) {
  const { templates, saveTemplate, deleteTemplate } = useTemplateStore();
  const [name, setName] = useState('');
  const [fillId, setFillId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const list = Object.values(templates).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filling = fillId ? templates[fillId] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTemplate({ id: crypto.randomUUID(), name: trimmed, content: editor.getJSON() });
    setName('');
  };

  /**
   * Import an uploaded .docx/.md file as a new template (#600). Parsed to the
   * editor's schema so `{{variables}}` in the file are picked up by the fill
   * flow. Resets the input so the same file can be re-selected after an error.
   */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const imported = await importFile(file, editor.schema);
      saveTemplate({ id: crypto.randomUUID(), name: imported.name, content: imported.content });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo importar el archivo.');
    }
  };

  const applyTemplate = (content: JSONContent, values: Record<string, string>) => {
    const filled = fillTemplate(content, values);
    // Insert the filled body at the cursor — never overwrite the whole doc.
    editor.chain().focus().insertContent(filled.content ?? []).run();
    onClose();
  };

  const startApply = (id: string) => {
    const template = templates[id];
    if (!template) return;
    if (extractVariables(template.content).length === 0) {
      applyTemplate(template.content, {});
      return;
    }
    setFillId(id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plantillas de documento"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/35 backdrop-blur-[2px] animate-in"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="air-glass-strong w-[580px] max-w-[92vw] overflow-hidden">
        {filling ? (
          <TemplateFillForm
            template={filling}
            onBack={() => setFillId(null)}
            onApply={(values) => applyTemplate(filling.content, values)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <LayoutTemplate className="size-4 text-muted" />
              <span className="flex-1 text-[14.5px] font-semibold">Plantillas</span>
              <Kbd>esc</Kbd>
            </div>

            {/* Save the current document as a template, or upload one. */}
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveCurrent();
                    }
                  }}
                  aria-label="Nombre de la plantilla"
                  placeholder="Guardar documento actual como…"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13.5px] outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FilePlus2 className="size-3.5" />}
                  disabled={!name.trim()}
                  onClick={saveCurrent}
                >
                  Guardar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload className="size-3.5" />}
                  onClick={() => fileInputRef.current?.click()}
                  title="Subir un .docx o .md como plantilla"
                >
                  Subir
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SUPPORTED_IMPORT}
                  onChange={handleUpload}
                  className="hidden"
                  aria-hidden
                />
              </div>
              {importError && <p className="text-[12px] text-danger">{importError}</p>}
            </div>

            {/* Library. */}
            <div className="max-h-[44vh] overflow-auto p-2 scrollbar-thin">
              {list.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted">
                  Aún no tienes plantillas. Guarda el documento actual para reutilizarlo.
                </div>
              ) : (
                list.map((t) => {
                  const varCount = extractVariables(t.content).length;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded px-2.5 py-2 text-[13.5px] transition-colors hover:bg-surface-2"
                    >
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-primary-soft text-indigo-700">
                        <FileText className="size-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={() => startApply(t.id)}
                        className="min-w-0 flex-1 text-left"
                        title="Aplicar plantilla"
                      >
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="truncate text-[12px] text-muted">
                          {varCount > 0 ? `${varCount} ${varCount === 1 ? 'variable' : 'variables'}` : 'Sin variables'}
                        </div>
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => startApply(t.id)}>
                        Aplicar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar plantilla ${t.name}`}
                        title="Eliminar"
                        onClick={() => deleteTemplate(t.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
