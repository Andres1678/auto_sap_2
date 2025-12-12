import { useState } from "react";

export default function ImportarExcelRegistro() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Seleccione un archivo");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);

    const res = await fetch("/api/registro/import-excel", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setLoading(false);

    alert(data.message);
  };

  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Importando..." : "Importar Excel"}
      </button>
    </div>
  );
}
