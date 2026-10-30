# Plotly Python support is loaded automatically when this file is run.
import plotly.express as px
fig = px.line(x=["A", "B", "C", "D"], y=[4, 8, 5, 11], title="Plotly from Python")
fig.show()
