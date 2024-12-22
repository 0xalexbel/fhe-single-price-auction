Prev: [Single Price Auction](./1-Single-Price-Auction.md) \
Next: [FHE Sort](./3-FHE-Sort.md)

# FHE Precomputations

1. [Bid Validation](#1-bid-validation)
    1. [Upper Bounds](#11-upper-bounds)
    2. [Quantity Clamping](#12-quantity-clamping)
    3. [Validation](#13-validation)
2. [Price Matrices $\mathbf{P_{eq}}$, $\mathbf{P_{ge}}$, $\mathbf{P_{gt}}$](#2-price-matrices--)
    1. [Definitions](#21-definitions)  
    2. [FHE Cost](#22-fhe-cost)  
3. [Quantity Matrices $\mathbf{Q_{eq}}$, $\mathbf{Q_{ge}}$, $\mathbf{Q_{gt}}$](#3-quantity-matrices--)
4. [Random Matrix $\mathbf{Rand_{gt}}$](#4-random-matrix)
    1. [Definition](#41-definition)
    2. [FHE Fisher-Yates Shuffle Algorithm](#42-fhe-fisher-yates-shuffle-algorithm)
    3. [FHE Cost](#43-fhe-cost)  
5. [Bid Order Comparison Matrix $\mathbf{B_{gt}}$](#5-bid-order-comparison-matrix)
    1. [Order by Price, Quantity, and Bid Placement](#51-order-by-price-quantity-and-bid-placement)
    2. [Order by Price and Bid Placement](#52-order-by-price-and-bid-placement)
    3. [Order by Price and Randomization](#53-order-by-price-and-randomization)

## 1. Bid Validation

### 1.1. Upper Bounds

To ensure that no operation results in arithmetic overflow, the following conditions must be satisfied:

```math 
\begin{split}
N &\lt 2^{16} \\
\sum_{i=1}^{N} q_i &\lt 2^{256}
\end{split}
```

which can be simplified into the stricter condition:

```math 
N \lt 2^{16} \ \text{ and } \ Q \lt 2^{240} \ \text{ and } \ \forall i \in I_N, \ q_i \le Q  
```

By imposing this condition on each bidder, we can handle the worst-case scenario without arithmetic overflow:

```math
\begin{cases}
\ N = 2^{16}-1 &\text { unique bidders participating in the auction, } \\
\ Q = 2^{240}-1 &\text { tokens available for sale in the auction, } \\
\ q = 2^{240}-1 &\text { quantity of tokens bid by each bidder. } \\
\end{cases}
```

### 1.2. Quantity Clamping
Ensure that bid quantities do not exceed the total available quantity $Q$:

```math
\forall i \in I_N, \quad q_i := \min(Q, q_i) 
```

### 1.3. Validation
Update bids to reflect validity conditions:

```math
(p_i, q_i) := 
\begin{cases}
(0, 0), \quad &\text{if } p_i = 0 \text{ or } q_i = 0, \\
(p_i, q_i), \quad &\text{otherwise.}
\end{cases}
```

## 2. Price Matrices $\mathbf{P_{eq}}$, $\mathbf{P_{ge}}$, $\mathbf{P_{gt}}$

### 2.1. Definitions

- Let $\mathbf{P_{eq}} = (\mathbf{P_{eq}}[i, \ j])_{\ 1 \le i, j \le N}$ denote the price equality matrix on $\mathcal{B}$, the entries $\mathbf{P_{eq}}[i, j]$ are defined as follows:

```math
\begin{split}
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{P_{eq}}[i, j] &= 
\begin{cases}
\ 1  \quad \text{if } \ p_{i} = p_{j} \\
\ 0  \quad \text{otherwise} \\
\end{cases}
\\
\\
\mathbf{P_{eq}}[i, j] &= 
\begin{cases}
\ 1              \quad &\text{if } \ i = j \\
\ p_{i} = p_{j}  \quad &\text{if } \ i < j \\
\ \mathbf{P_{eq}}[j, i] \quad &\text{if } \ i > j \\
\end{cases}
\end{split}
```

- Let $\mathbf{P_{ge}} = (\mathbf{P_{ge}}[i, \ j])_{\ 1 \le i, j \le N}$ denote the price comparison matrix on $\mathcal{B}$, the entries $\mathbf{P_{ge}}[i, j]$ are defined as follows:

```math
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{P_{ge}}[i, j] = 
\begin{cases}
\ 1  \quad \text{if } \ p_{i} \ge p_{j} \\
\ 0  \quad \text{otherwise} \\
\end{cases}
```

- Let $\mathbf{P_{gt}} = (\mathbf{P_{gt}}[i, \ j])_{\ 1 \le i, j \le N}$ denote the price comparison matrix on $\mathcal{B}$, the entries $\mathbf{P_{gt}}[i, j]$ are defined as follows:

```math
\begin{split}
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{P_{gt}}[i, j] &= 
\begin{cases}
\ 1  \quad \text{if } \ p_{i} > p_{j} \\
\ 0  \quad \text{otherwise} \\
\end{cases}
\\
\\
\mathbf{P_{gt}}[i, j] &= 
\begin{cases}
\ 0              \quad &\text{if } \ i = j \\
\ p_{i} > p_{j}  \quad &\text{if } \ i < j \\
\ p_{j} < p_{i} = \neg(\ \mathbf{P_{ge}}[j, i] \ )  \quad &\text{if }  \ i > j \\
\end{cases}
\end{split}
```

### 2.2. FHE Cost

|                     | fheEq(U256) | fheGe(U256) | fheGt(U256) | fheBitOr(bool) | fheNot(bool) | FHE Units   |
| :---                | :---:       | :---:       |  :---:      |  :---:         |  :---:       | :---:       |
| $\mathbf{P_{eq}}$   | $N(N-1)/2$  | $0$         | $0$         | $0$            | $0$          | $2N(N-1)$   |
| $\mathbf{P_{ge}}$   | $0$         | $N(N-1)$    | $0$         | $0$            | $0$          | $9N(N-1)$   |
| $\mathbf{P_{gt}}$ (using $\mathbf{P_{ge}}$) | $0$  | $0$  | $N(N-1)/2$   | $0$ | $N(N-1)/2$   | $5N(N-1)$  |
| $\mathbf{P_{gt}}$ (using $\mathbf{P_{eq}}$) | $0$  | $0$  | $N(N-1)/2$   | $N(N-1)/2$  | $N(N-1)/2$  | $11N(N-1)/2$  |
| $\mathbf{P_{ge}}$ (using $\mathbf{P_{gt}}$, $\mathbf{P_{eq}}$) | $0$  | $0$  | $0$   | $N(N-1)$  | $0$  | $N(N-1)$  |

Thus, the most efficient way to compute the 2 matrices $\mathbf{P_{gt}}$ and $\mathbf{P_{ge}}$ is as follows:

1. Compute the $\mathbf{P_{eq}}$ matrix,
2. Then compute the $\mathbf{P_{gt}}$ matrix using the $\mathbf{P_{eq}}$ matrix,
3. Then compute the $\mathbf{P_{ge}}$ matrix using the $\mathbf{P_{eq}}$ matrix and the $\mathbf{P_{gt}}$ matrix

```math
\text{total FHE units} = \frac{17}2N(N-1)
```

## 3. Quantity Matrices $\mathbf{Q_{eq}}$, $\mathbf{Q_{ge}}$, $\mathbf{Q_{gt}}$

Similarly, we define the quantity matrices $\mathbf{Q_{eq}}$, $\mathbf{Q_{gt}}$ and $\mathbf{Q_{ge}}$ in the same manner.

## 4. Random Matrix $\mathbf{Rand_{gt}}$

To perform the auction allocation using price and randomization, we assign each bidder $B_i$ a unique random value to serve as a tie-breaking rule between bidders.

To achieve this, we shuffle the set $\{ 1, 2, 3, \dots, N \}$ using a FHE implementation of the $O(N)$ Fisher–Yates shuffle algorithm.

### 4.1. Definition

- Let $rand(i)$ denote a bijective function that assigns a unique random value to each bidder $B_i$. It is formally defined as follows:

```math
rand: I_N \to I_N
```

```math
\forall i,j \in I_N, \quad i = j \iff rand(i) = rand(j)
```

- Let $\mathbf{Rand_{gt}} = (\mathbf{Rand_{gt}}[i, \ j])_{\ 1 \le i, j \le N}$ denote random value comparison matrix on $\mathcal{B}$. The entries $\mathbf{Rand_{gt}}[i, j]$ are defined as follows:

```math
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{Rand_{gt}}[i, j] = 
\begin{cases}
\ 1  \quad \text{if } \ rand(i) > rand(j) \\
\ 0  \quad \text{otherwise} \\
\end{cases}
```

### 4.2. FHE Fisher-Yates Shuffle Algorithm

One way to compute the matrix $\mathbf{Rand_{gt}}$ is by employing the $O(N)$ Fisher-Yates shuffle algorithm of the set $\{ 1, 2, 3, \dots, N \}$.

#### Solidity Sample Code

```js
// returns true if i is a power of 2
function isPowerOfTwo(uint16 i) returns (bool);

function swap(uint16 a, euint16 b, euint16[] memory arr) {
    for(uint16 i = 0; i < N; ++i) {
        ebool b_eq_i = TFHE.eq(b, i);
        // arr[b] = arr[a];
        arr[i] = TFHE.ifThenElse(b_eq_i, arr[a], arr[i]);
        // arr[a] = arr[b]
        arr[a] = TFHE.ifThenElse(b_eq_i, arr[i], arr[a]);
    }
}

function shuffle(euint16[] memory arr) {
    for(uint16 i = N-1; i >= 1; --i) {
        euint16 j;
        // j = random integer such that 0 ≤ j ≤ i
        if (isPowerOfTwo(i+1)) {
            // returns [0, i+1) = [0, i]
            j = TFHE.randEuint16(i+1);
        } else {
            euint16 rnd = TFHE.randEuint16();
            // returns [0, i+1) = [0, i]
            j = TFHE.rem(rnd, i+1);
        }
        swap(i, j, arr);
    }
}

function rand(uint16 i) returns(euint16) {
    return shuffledArray[i];
}
```

### 4.3. FHE Cost

|       | fheEq(U16) | fheIfThenElse(U16) | fheRand(U16) | fheRem(U16) | fheGt(U16) | FHE units
| :---  | :---:      | :---:              | :---:        | :---:       | :---: | :---:
| $swap$                  | $N$  | $2N$  | $0$   | $0$  | $0$ | $6N$ 
| $shuffle$ (upper bound) | $0$  | $0$   | $N-1$ | $N-1$ | $0$ | $(28 + 6N)(N-1)$
| $\mathbf{Rand_{gt}}$ | $0$  | $0$   | $0$ | $0$ | $N^2$ | $2N^2$


## 5. Bid Order Comparison Matrix $\mathbf{B_{gt}}$

Given a strict order relation $>$ on $\mathcal{B}$, we define $\mathbf{B_{gt}} = (\mathbf{B_{gt}}[i, j])_{1 \le i, j \le N}$ as the **binary comparison matrix** associated with $>$. The entries $\mathbf{B_{gt}}[i, j]$ are defined as follows:

```math
\forall i, j \in \{1, 2, 3, \dots, N\}, \quad \mathbf{B_{gt}}[i, j] = 
\begin{cases}
1  & \text{if } B_i > B_j, \\
0  & \text{otherwise}.
\end{cases}
```

## 5.1. Order by Price, Quantity, and Bid Placement

### Comparison Matrix 

```math
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{B_{gt}}[i, j] = 
\begin{cases}
\ 0  \quad &\text{if } \ i = j \\
\ \mathbf{P_{ge}}[i, j] \ \land \ [ \ \mathbf{P_{gt}}[i, j] \ \lor \ \mathbf{Q_{ge}}[i, j] \ ]  \quad &\text{if } \ i < j \\
\ \neg \mathbf{B_{gt}}[j, i] \quad &\text{if } \ i > j
\ \end{cases}
```

### FHE Cost

|                           |fheBitOr(bool) | fheBitAnd(bool) | fheNot(bool)  | FHE Units    |
| :---                      | :---:         | :---:           | :--:          | :--:
| $\mathbf{B_{gt}}$         | $N(N-1)/2$    | $N(N-1)/2$      | $N(N-1)/2$    | $3N(N-1)/2$


## 5.2. Order by Price and Bid Placement

### Comparison Matrix 

```math
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{B_{gt}}[i, j] = 
\begin{cases}
\ 0  \quad &\text{if } \ i = j \\
\ \mathbf{P_{ge}}[i, j] \quad &\text{if } \ i < j \\
\ \mathbf{P_{gt}}[i, j] \quad &\text{if } \ i > j
\ \end{cases}
```

### Cost

The additionnal cost is null when bidders are sorted using price and bid placement.

## 5.3. Order by Price and Randomization

### Comparison Matrix

Using the $\mathbf{Rand_{gt}}$ matrix defined above, the comparison matrix can be computed as follows:

```math
\forall i,j \in \{1,2,3, \dots, N\}, \quad \mathbf{B_{gt}}[i, j] = 
\begin{cases}
\ 0  \quad &\text{if } \ i = j \\
\ \mathbf{P_{ge}}[i, j] \land [ \ \mathbf{P_{gt}}[i, j] \lor \mathbf{Rand_{gt}}[i, j] \ ] \quad &\text{if } \ i \lt j \\
\ \neg \mathbf{B_{gt}}[j, i] \quad &\text{if } \ i > j
\ \end{cases}
```

### FHE Cost

|                           |fheBitOr(bool) | fheBitAnd(bool) | fheNot(bool)  | FHE Units    |
| :---                      | :---:         | :---:           | :--:          | :--:
| $\mathbf{B_{gt}}$         | $N(N-1)/2$    | $N(N-1)/2$      | $N(N-1)/2$    | $3N(N-1)/2$

<br>

------

<br>

Prev: [Single Price Auction](./1-Single-Price-Auction.md) \
Next: [FHE Sort](./3-FHE-Sort.md)
