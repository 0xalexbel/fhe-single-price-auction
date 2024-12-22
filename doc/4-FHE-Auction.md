Next: [FHE Sort](./3-FHE-Sort.md) \
Prev: [FHE Cost](./5-FHE-Cost.md)

# FHE Auction

1. [Cumulative Quantity Vector $\mathbf{c_{rank}}$](#1-cumulative-quantity-vector)
2. [Final Quantity Vector $\mathbf{q_{rank}^{*}}$](#2-final-quantity-vector)
3. [Final Uniform Price $p_{u}^{(b)}$](#3-final-uniform-price)

## 1. Cumulative Quantity Vector $\mathbf{c_{rank}}$

### 1.1. Definition

Let $\mathbf{c_{rank}}[k]$, where $k \in \{0, 1, 2, \dots, N\}$, denote the cumulative quantity of tokens bid by the top $k$-th highest-ranked bidders when the auction concludes. Specifically, it is given by:

```math
\mathbf{c_{rank}}[k] = 
\begin{cases}
0 \quad &\text{if } k = 0
\\
\sum_{i=1}^{k} \mathbf{q_{rank}}[i] \quad &\text{if } k > 0
\end{cases}
```

Let $\mathbf{1_{valid}}[k]$, where $k \in \{1, 2, \dots, N\}$, denote the binary valid indicator for the cumulative bid quantity, defined as follows:

```math
\mathbf{1_{valid}}[k] = 
\begin{cases}
1 \quad & \text{if } \ \mathbf{c_{rank}}[k-1] < Q \\
0 \quad & \text{otherwise}
\end{cases}
```

Here:
- $Q$ denotes the total offered quantity of tokens.
- A value of $\mathbf{1_{valid}}[k] = 1$ indicates that the cumulative bid quantity up to the $(k-1)$-th rank is **valid** meaning there are still tokens left to be distributed.
- A value of $\mathbf{1_{valid}}[k] = 0$ indicates that an overflow occurred at rank $k-1$, so no tokens remain to distribute at rank $k$.


### 1.2. FHE Cost 

|                      | fheAdd(U256) | fheLt(U256) | FHE units
| :---                 | :---:        | :---:       | :--:
| $\mathbf{c_{rank}}$  | $N-1$        | $0$         | $10(N-1)$ 
| $\mathbf{1_{valid}}$ | $0$          | $9N$        | $9N$ 


## 2. Final Quantity Vector $\mathbf{q_{rank}^{*}}$

### 2.1. Definition

Let $\mathbf{q_{rank}^{*}} = (\mathbf{q_{rank}^{*}}[k])_{1 \le k \le N}$ denote the vector whose $k$-th entry represents the maximum theoretical cumulative quantity of tokens won by all the $k$-th highest-ranked bidders upon completion of the auction.

```math
\mathbf{q_{rank}^{*}}[k] = 
\begin{cases}
\mathbf{q_{rank}}[k] \quad & \text{if } \ \mathbf{1_{valid}}[k] \\
0 \quad & \text{otherwise }
\end{cases}
```

#### Case with Unique Rankings:

When $>$ produces a set of bidders with unique rankings (i.e. no ties), the value of $\mathbf{q_{rank}^{*}}[k]$ must be clamped to $Q - \mathbf{c_{rank}}[k-1]$ and the above formula is modified as follows:

```math
\mathbf{q_{rank}^{*}}[k] = 
\begin{cases}
\min(\mathbf{q_{rank}}[k], \ Q - \mathbf{c_{rank}}[k-1]) \quad & \text{if } \ \mathbf{1_{valid}}[k] \\
0 \quad & \text{otherwise }
\end{cases}
```

Here:
- The condition $\text{if } \ \mathbf{1_{valid}}[k]$ ensures that no arithmetic overflow occurs.
- In case of unique rankings, $\mathbf{q_{rank}^{*}}[k]$ represents the final quantity of tokens won by the bidder ranked in the $k$-th position. 

### 2.2. FHE Cost 

|                      | fheMin(U256) | fheSub(U256)| fheIfThenElse(U256) | FHE units
| :---                 | :---:        | :---:       | :--:                | :--:
| $\mathbf{q_{rank}^{*}}$ (unique rankings) | $N$ | $N$ | $N$ | $25N$
| $\mathbf{q_{rank}^{*}}$ (with ties)       | $0$ | $0$ | $N$ | $4N$

### 2.3. Solidity sample code

```js
// If bidders can have identical rankings (i.e., ties exist)
function qRankStarWithTies(uint16 k) returns(euint256) {
    return TFHE.ifThenElse(valid(k), qRank(k), TFHE.asEuint256(0));
}
```

```js
// If bidders have unique rankings (i.e., there are no ties)
function qRankStarUnique(uint16 k) returns(euint256) {
    euint256 q_max = TFHE.sub(Q, crank(k-1));
    euint256 q_clamped = TFHE.min(qRank(k), q_max);
    return TFHE.ifThenElse(valid(k), q_clamped, TFHE.asEuint256(0));
}    
```

## 3. Final Uniform Price $p_{u}^{(b)}$ <a id="pub"></a>

### 3.1. Definition

$p_{u}^{(b)}$, the final uniform price for each token sold when the auction concludes, is determined by the following recurrence relation:

```math
\forall k \in \{0,1,2, \dots, N\} \quad p_{k}^{*} = 
\begin{cases}
0 &\text{if} \quad k = 0
\\
\mathbf{p_{rank}}[k] \quad &\text{if} \quad \mathbf{1_{valid}}[k] \ \text{ and } \ k > 0
\\
p_{k-1}^{*} \quad &\text{otherwise} \\
\end{cases}
```

```math
\text{final uniform price} = p_{u}^{(b)} = p_{N}^{*}
```

The final uniform price value can interpreted as follows:

```math 
\begin{split}
p_{u}^{(b)} &= 0 \quad \text{if there are no winning bidders}
\\
p_{u}^{(b)} &> 0 \quad \text{if the auction concludes with at least one winning bidder}
\end{split}
```

### 3.2. FHE Cost 

|        | fheIfThenElse(U256) | FHE units
| :---   | :---:        | :---:
| $p_{u}^{(b)}$      | $N$    | $4N$

<br>

------

<br>

Next: [FHE Sort](./3-FHE-Sort.md) \
Prev: [FHE Cost](./5-FHE-Cost.md)
