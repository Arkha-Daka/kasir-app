/* ===================================
   CHARTS - Global (no export)
=================================== */

let salesChart = null;

window.renderSalesChart = function(canvasId, transaksiData) {

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = [];
  const dataChart = [];

  transaksiData.forEach((doc) => {

    const data = doc.data
      ? doc.data()
      : doc;

    labels.push(data.tanggal || "-");
    dataChart.push(Number(data.total || 0));

  });

  if (salesChart) {
    salesChart.destroy();
    salesChart = null;
  }

  if (typeof Chart === "undefined") {
    console.error("Chart.js belum dimuat!");
    return;
  }

  const ctx = canvas.getContext("2d");

  salesChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Omzet Penjualan",
        data: dataChart,
        borderWidth: 3,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });

};
