import type { CSSProperties, ReactNode } from 'react';
import type { ParamDef, ParamDefs, ParamInput, ParamValue, Presets } from './protocol.js';

interface ParamPanelProps {
  defs: ParamDefs;
  presets: Presets;
  input: ParamInput;
  onChange: (name: string, value: ParamValue) => void;
  onPreset: (name: string) => void;
  onReset: () => void;
}

const field: CSSProperties = { display: 'grid', gap: 4, marginBottom: 14 };
const labelRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};
const control: CSSProperties = {
  background: '#11141a',
  color: '#e6e9ee',
  border: '1px solid #3a414c',
  borderRadius: 6,
  padding: '6px 8px',
  font: 'inherit',
  minWidth: 0,
};
const hint: CSSProperties = { color: '#8b95a3', fontSize: 12 };
const groupTitle: CSSProperties = {
  color: '#8b95a3',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '18px 0 10px',
};

function NumberControl(props: {
  id: string;
  def: Extract<ParamDef, { type: 'number' }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const { id, def, value, onChange } = props;
  const step = def.step ?? (def.integer ? 1 : 'any');
  const emit = (text: string) => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onChange(n);
  };
  const ranged = def.min !== undefined && def.max !== undefined;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: ranged ? '1fr 84px' : '1fr', gap: 8 }}>
      {ranged && (
        <input
          type="range"
          aria-label={def.label ?? id}
          min={def.min}
          max={def.max}
          step={step}
          value={value}
          onChange={(e) => {
            emit(e.target.value);
          }}
        />
      )}
      <input
        id={id}
        type="number"
        style={control}
        min={def.min}
        max={def.max}
        step={step}
        value={value}
        onChange={(e) => {
          emit(e.target.value);
        }}
      />
    </div>
  );
}

function Control(props: {
  id: string;
  def: ParamDef;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}): ReactNode {
  const { id, def, value, onChange } = props;
  switch (def.type) {
    case 'number':
      return <NumberControl id={id} def={def} value={Number(value)} onChange={onChange} />;
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          style={{ justifySelf: 'start', width: 18, height: 18 }}
          checked={value === true || value === 'true'}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
        />
      );
    case 'choice':
      return (
        <select
          id={id}
          style={control}
          value={String(value)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'string':
      return (
        <input
          id={id}
          type="text"
          style={control}
          maxLength={def.maxLength}
          value={String(value)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      );
  }
}

function groupsOf(defs: ParamDefs): [string, [string, ParamDef][]][] {
  const groups = new Map<string, [string, ParamDef][]>();
  for (const entry of Object.entries(defs)) {
    const key = entry[1].group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups];
}

export function ParamPanel({ defs, presets, input, onChange, onPreset, onReset }: ParamPanelProps) {
  const presetNames = Object.keys(presets);
  if (Object.keys(defs).length === 0) {
    return <p style={hint}>This part has no parameters.</p>;
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {presetNames.length > 0 && (
          <select
            aria-label="Preset"
            style={{ ...control, flex: 1 }}
            value=""
            onChange={(e) => {
              if (e.target.value !== '') onPreset(e.target.value);
            }}
          >
            <option value="">Preset…</option>
            {presetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <button type="button" style={{ ...control, cursor: 'pointer' }} onClick={onReset}>
          Reset
        </button>
      </div>
      {groupsOf(defs).map(([group, entries]) => (
        <section key={group}>
          {group !== '' && <h2 style={groupTitle}>{group}</h2>}
          {entries.map(([name, def]) => {
            const id = `param-${name}`;
            return (
              <div key={name} style={field}>
                <div style={labelRow}>
                  <label htmlFor={id}>{def.label ?? name}</label>
                  {def.type === 'number' && def.unit && <span style={hint}>{def.unit}</span>}
                </div>
                <Control
                  id={id}
                  def={def}
                  value={input[name] ?? def.default}
                  onChange={(v) => {
                    onChange(name, v);
                  }}
                />
                {def.description && <span style={hint}>{def.description}</span>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
