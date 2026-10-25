import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Field from '../../components/Field.jsx'
import { lbtnDark, lcard, lfield } from '../../components/ui.js'
import { addCustomProduct, listCategories } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'

export default function AddCustom() {
  const navigate = useNavigate()
  const { data: categories = [] } = useData(listCategories)
  const [form, setForm] = useState({ name: '', size: '', category_id: 'atta', price: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    try {
      await addCustomProduct(form)
      navigate('/shop/products')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <Link to="/shop/products/add" className="flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={18} /> Library</Link>
      <h1 className="mt-1 text-2xl font-black">Custom product</h1>
      <p className="text-sm text-neutral-500">Admin review ke baad customers ko dikhega (aaj hi).</p>
      <form onSubmit={submit} className={`${lcard} mt-4 space-y-3 p-4`}>
        <Field label="Product name"><input required value={form.name} onChange={set('name')} placeholder="Pitha Guri (Rice Flour)" className={lfield} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size"><input value={form.size} onChange={set('size')} placeholder="500 g" className={lfield} /></Field>
          <Field label="Price (₹)"><input required type="number" min="1" value={form.price} onChange={set('price')} className={lfield} /></Field>
        </div>
        <Field label="Category">
          <select value={form.category_id} onChange={set('category_id')} className={lfield}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <p className="text-xs text-neutral-500">Photo upload database connect hone ke baad. Bina photo ke category icon dikhega.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className={`${lbtnDark} h-12 w-full`}>Save</button>
      </form>
    </div>
  )
}
