// Plotly.js is detected and loaded automatically when you press Run.
const host = document.createElement('div');
host.style.cssText = 'width:100%;height:90vh';
document.body.appendChild(host);
Plotly.newPlot(host,[{x:['A','B','C','D'],y:[4,8,5,11],type:'scatter',mode:'lines+markers'}],{title:'Automatic Plotly preview',paper_bgcolor:'#10172a',plot_bgcolor:'#10172a',font:{color:'#fff'}},{responsive:true});
