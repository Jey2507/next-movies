import './AddItemForm.css'
import { TYPES } from '../../constants'

// Manual "add to queue" form (title/type/year/genre), for titles TMDB search
// (SearchBox) doesn't find. Submit handler + field state live in App.jsx.
export default function AddItemForm({ title, onTitleChange, type, onTypeChange, year, onYearChange, genre, onGenreChange, onSubmit }) {
  return (
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
  )
}
