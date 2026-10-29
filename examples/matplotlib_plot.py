import matplotlib.pyplot as plt
import math

x = [i / 10 for i in range(0, 100)]
y = [math.sin(v) for v in x]
plt.figure(figsize=(8, 4))
plt.plot(x, y, label="sin(x)")
plt.title("Python Matplotlib Preview")
plt.xlabel("x")
plt.ylabel("sin(x)")
plt.grid(True)
plt.legend()
plt.show()
