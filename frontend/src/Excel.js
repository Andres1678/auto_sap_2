import { useRef, useState } from "react";

export default function ImportarExcelRegistro() {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      alert("Seleccione un archivo");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);

    try {
      const res = await fetch("/api/registro/import-excel", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      alert(data.mensaje || "Importado correctamente");
    } catch (error) {
      console.error(error);
      alert("Error importando Excel");
    } finally {
      setLoading(false);
      // limpiar input SOLO al final
      fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
      />

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Importando..." : "Importar Excel"}
      </button>
    </div>
  );
}
