import React from 'react';
import './PanelGraficos.css';
import Graficos from './Graficos';

const PanelGraficos = ({ registros }) => {
  return (
   <div className="panel-graficos-container">
        <div className="grafico-box">
            <h3>Dashboard Horas</h3>
            <Graficos registros={registros} />
        </div>
    </div>
  );
};

export default PanelGraficos;