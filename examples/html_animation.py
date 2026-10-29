from IPython.display import HTML, display

display(HTML(r"""
<div style="height:280px;display:grid;place-items:center;background:#0b1020;border-radius:12px;overflow:hidden">
  <div class="orb"></div>
</div>
<style>
.orb{width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff,#54d8ff 20%,#6a5cff 55%,#141638);box-shadow:0 0 50px #54d8ff;animation:float 2.4s ease-in-out infinite alternate}
@keyframes float{to{transform:translate(80px,-45px) rotate(35deg);filter:hue-rotate(120deg)}}
</style>
"""))
