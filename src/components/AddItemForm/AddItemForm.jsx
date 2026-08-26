import { useState } from 'react'
import './AddItemForm.css'
import { TYPES } from '../../constants'

// Manual "add to queue" form (title/type/year/genre), for titles TMDB search
// (SearchBox) doesn't find. Submit handler + field state live in App.jsx.
// The form itself is collapsed behind the hint below the search box and
// slides open on click (local UI state, kept out of App.jsx on purpose).
export default function AddItemForm({ title, onTitleChange, type, onTypeChange, year, onYearChange, genre, onGenreChange, onSubmit }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="add-row-hint"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Can’t find it above? Add it manually</span>
        <svg className="add-row-hint-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`add-row-collapse${open ? ' open' : ''}`}>
        <div className="add-row-collapse-inner">
          <form className="add-row" onSubmit={onSubmit}>
            <input
              className="add-input add-input--title"
              placeholder="Add manually: title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
            <select className="add-input add-input--type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <input
              className="add-input add-input--year"
              placeholder="Year"
              value={year}
              onChange={(e) => onYearChange(e.target.value)}
            />
            <input
              className="add-input add-input--genre"
              placeholder="Genre"
              value={genre}
              onChange={(e) => onGenreChange(e.target.value)}
            />
            <button className="add-btn" type="submit">Add to queue</button>
          </form>
        </div>
      </div>
    </>
  )
}
