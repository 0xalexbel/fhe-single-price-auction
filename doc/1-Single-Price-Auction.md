Next: [FHE Precomputations](./2-FHE-Precomputations.md)

# Single-Price Auction

1. [Definitions](#definitions)
    1. [Bidder Setup](#bidder-setup)
    2. [Bid Definitions](#bid-definitions)
    3. [Equivalence Class of a Price](#equivalence-class-of-a-price)
    4. [Total Quantity Bid at a Price](#total-quantity-bid-at-a-price)
    5. [Cumulative Quantity of Tokens](#cumulative-quantity-of-tokens)
2. [Auction](#auction)
    1. [Bid Validation](#bid-validation)
    2. [Uniform Price](#uniform-price)
    2. [Allocation](#allocation)
        1. [Case 1: Exact Match $C_u = Q$](#case-1-exact-match)
        2. [Case 2: $C_u > Q$ with a single bidder at $p_{u}^{(b)}$](#case-2--with-a-single-bidder-at)
        3. [Case 3: $C_u > Q$ with multiple bidders at $p_u^{(b)}$](#case-3--with-multiple-bidders-at)
3. [FHE Tie-Breaking](#fhe-tie-breaking)
    1. [Bid Placement Order](#1-bid-placement-order)
    2. [Total Strict Order Relations](#2-total-strict-order-relations)
        1. [Order by Price, Quantity, and Bid Placement](#21-order-by-price-quantity-and-bid-placement)
        2. [Order by Price and Bid Placement](#22-order-by-price-and-bid-placement)
        3. [Order by Price and Randomization](#23-order-by-price-and-randomization)


## 1. Definitions

### 1.1. Bidder Setup
- Let $B_i$ denote the $i$-th bidder participating in a single-price auction with $N$ bidders, where $i \in \lbrace 1, 2, 3, \dots, N \rbrace$.

- Let $I_N = \lbrace, 2, 3, \dots, N\rbrace$ denote the **index set** of bidders. We refer to $I_N$ as the set of all bidder indices.

- Let $\mathcal{B} = \lbrace B_1, B_2, B_3, \dots, B_N \rbrace$ denote the **bidder set**, which represents all participants in the auction. Each $B_i$ corresponds to the $i$-th bidder.

### 1.2. Bid Definitions
- Let $q_i$ denote the **quantity of tokens** that bidder $B_i$ wishes to purchase.

- Let $p_i$ denote the **unit price** that bidder $B_i$ is willing to pay for each token.

- Let $\mathcal{P}_{all}$ denote the **set of all bid prices** in the auction, including repeated bids at the same price. Formally:
  
```math
\mathcal{P}_{all} = \lbrace p_i \mid i \in I_N \rbrace
```

### 1.3. Equivalence Class of a Price
- Let $S_p$ denote the **set of bidders** who bid at price $p$. This is formally defined as the **equivalence class** of $p$:
  
```math
S_p = \lbrace i \mid p_i = p, \, i \in I_N \rbrace
```

### 1.4. Total Quantity Bid at a Price
- Let $Q_p$ denote the **total quantity of tokens bid** at price $p$. It is defined as:
  
```math
Q_p = \sum_{i \in S_p} q_i
```

### 1.5. Set of Distinct Bid Prices
- Let $\mathcal{P}_{bids}$ denote the **set of distinct prices** bid in the auction (i.e., prices with one or more bidders). Formally:
  
```math
\mathcal{P}_{bids} = \lbrace p \mid \text{Card}(S_p) > 0 \rbrace
```

- Let $K = \text{Card}(\mathcal{P}_{bids})$ denote the number of distinct bid prices in the auction.

- Let $\mathcal{P}_{bids}$ be represented as a **sorted list** of distinct prices in **decreasing order**:
  
```math
\mathcal{P}_{bids} = \lbrace p_{1}^{(b)}, p_{2}^{(b)}, \dots, p_{K}^{(b)} \rbrace \quad \text{where} \quad p_{1}^{(b)} > p_{2}^{(b)} > \dots > p_{K}^{(b)}
```

### 1.6. Cumulative Quantity of Tokens
- Let $C_k$ denote the **cumulative quantity of tokens bid** up to price $p_k^{(b)}$. It is defined recursively as:
  
```math
\begin{split}
C_0 &= 0, \\
C_k &= \sum_{i = 1}^{k} Q_{p_i^{(b)}} \quad \text{for} \ k \geq 1
\end{split}
```

## 2. Auction

### 2.1 Bid Validation

In the remainder of the problem, a bid is considered **valid** if and only if both its quantity and price are strictly positive. An **invalid** bid is equivalent to a bid with both price and quantity set to zero. Additionally, no bid quantity should exceed the total quantity of tokens available for sale, $Q$. This process is formally defined as follows:

```math
\forall i \in I_N, \quad 
\begin{cases}
p_i > 0 \text{ and } 0 < q_i \le Q, \quad &\text{if the bid is valid}, \\
p_i = 0 \text{ and } q_i = 0, \quad &\text{if the bid is invalid.}
\end{cases}
```

### 2.2. Uniform Price
- In a **uniform price auction**, the **uniform price** $p_u^{(b)}$ is the smallest price such that the cumulative quantity of tokens bid satisfies the total sold quantity $Q$. Formally:
  
```math
p_{u}^{(b)} \ \text{is the uniform price such that} \ 1 \leq u \leq K \ \text{ and } \
C_{u-1} < Q \leq C_{u}
```

### 2.3 Allocation

#### Case 1: Exact Match $C_u = Q$

Each winning bidder $B_i$ receives exactly the quantity $q_i$ they bid for because the total cumulative demand equals the supply. Formally:

```math
\forall i \in I_N \quad q_i^{*} = 
\begin{cases}
q_i \quad &\text{if } \ p_i \ge p_{u}^{(b)} \\
0 \quad &\text{if } p_i < p_{u}^{(b)}
\end{cases}
```

#### Case 2: $C_u > Q$ with a single bidder at $p_{u}^{(b)}$

Since only one bidder bids at $p_{u}^{(b)}$, this bidder's token quantity must be partially fulfilled to satisfy the total available token quantity $Q$.

```math
\forall i \in I_N \quad q_i^{*} = 
\begin{cases}
q_i \quad &\text{if } \ p_i > p_{u}^{(b)} \\
Q - C_{u-1} \quad &\text{if } \ p_i = p_{u}^{(b)} \\
0 \quad &\text{if } p_i < p_{u}^{(b)}
\end{cases}
```

#### Case 3: $C_u > Q$ with multiple bidders at $p_u^{(b)}$

When the cumulative quantity $C_u$ exceeds the total available quantity $Q$, the remaining quantity $Q - C_{u-1}$ must be allocated among multiple bidders tied at price $p_u^{(b)}$. We propose the following four tie-breaking rules:

- FHE-compliant rules:

    1. **Price, Quantity and Bid Placement**: Bidders at price $p_u^{(b)}$ are sorted based on their quantity and register ID (or timestamp)

    2. **Price and Bid Placement**: Bidders at price $p_u^{(b)}$ are sorted based on their register ID (or timestamp).

    3. **Price and Randomization**: A unique winning bidder among those at price $p_u^{(b)}$ is randomly selected.

- Non-FHE-compliant rules:

    4. **Pro-Rata Quantity Allocation**: The remaining total token quantity $Q - C_{u-1}$ is allocated **proportionally** to the quantities requested by each bidder at $p_u^{(b)}$. This rule is **not FHE-compliant** since it requires the FHE computation of integer divisions.

## 3. FHE Tie-Breaking

In auction theory, it is essential to establish a tie-breaking rule to resolve situations where two or more bidders are tied (e.g., when they bid the same price). In the context of an FHE auction, the chosen tie-breaking rule must be FHE-compatible.

One way to achieve this is by using an FHE-compliant **total strict order** relation over the set of bidders $\mathcal{B}$, which eliminates any possible ties, preserves the final uniform price $p_u^{(b)}$, and transforms any situation where $C_u > Q$ with multiple bidders at $p_u^{(b)}$ into a solvable case with only a single bidder at $p_u^{(b)}$.

The final quantity allocation is performed according to the bid order induced by $>$ until all remaining tokens are sold. The last winning bidder's token quantity may be partially fulfilled to match the total available token quantity $Q$. This method ensures that the final uniform price is also $p_u^{(b)}$.

### 3.1. Bid Placement Order

At the start of the auction, each bidder $B_i$ is assigned a **unique registration value** $id_i$ that reflects the order in which they placed their bid. This value can be represented by a **register ID** or **timestamp**, ensuring each bidder has a unique and comparable placement value. The following properties hold for $id_i$:

1. **Uniqueness:**  
  For any two bidders $B_i$ and $B_j$:

```math
id_i = id_j \iff i = j
```

  This ensures that each bidder has a unique registration value.

2. **Descending Order:**  
   The registration values $id_i$ are assigned such that:
   
```math
id_i > id_j \iff i < j
```
   
   This means that bidder $B_1$ placed their bid first, and bidder $B_N$ placed their bid last.

As a result, we assume that the identity relation holds for all bidders in $\mathcal{B}$, expressed as:

```math
B_i = B_j \iff i = j \iff id_i = id_j
```

### 3.2. Total Strict Order Relations

Below, we introduce three different strict order relations such that:
1. The set of bidders $\mathcal{B}$ is totally ordered 
2. The final uniform price $p_u^{(b)}$ is preserved.

#### 3.2.1. Order by Price, Quantity, and Bid Placement

We define a strict total order $>$ on the set of bidders $B_i$, where $i \in I_N$, as follows:

```math
\forall i, j \in I_N, \quad B_i > B_j \iff \begin{cases} 
\ p_i > p_j, & \text{(resolved by higher price)}, \\ 
\ \text{or} \\
\ p_i = p_j \text{ and } q_i > q_j, & \text{(resolved by higher quantity)}, \\
\ \text{or} \\
\ p_i = p_j \text{ and } q_i = q_j \text{ and } id_i < id_j, & \text{(resolved by earlier bid placement)}.
\end{cases}
```

This defines a **total strict order** on the set of bidders. Specifically:
- Bidders with higher prices are ranked higher.
- If the prices are equal, the bidder with the higher quantity is ranked higher.
- If both price and quantity are equal, the bidder with the earlier bid placement (lower $id_i$) is ranked higher.
- $p_u^{(b)}$ is preserved.

#### 3.2.2. Order by Price and Bid Placement

We define a strict total order $>$ on the set of bidders $B_i$, where $i \in I_N$, as follows:

```math
\forall i, j \in I_N, \quad B_i > B_j \iff \begin{cases} 
\ p_i > p_j, & \text{(resolved by higher price)}, \\ 
\text{or} \\
\ p_i = p_j \text{ and } id_i < id_j, & \text{(resolved by earlier bid placement)}.
\end{cases}
```

This defines a **total strict order** on the set of bidders. Specifically:
- Bidders with higher prices are ranked higher.
- If the prices are equal, the bidder with the earlier bid placement (lower $id_i$) is ranked higher.
- $p_u^{(b)}$ is preserved.

#### 3.2.3. Order by Price and Randomization

Let $rand(i)$ be a random value uniquely assigned to each bidder $B_i$, used for tie-breaking in the order relation.

We define a strict order $>$ on the set of bidders $B_i$, where $i \in I_N$ as follows:

```math
\forall i, j \in I_N, \quad B_i > B_j \iff \begin{cases} 
\ p_i > p_j, & \text{(resolved by higher price)}, \\ 
\text{or} \\
\ p_i = p_j \text{ and } rand(i) > rand(j), & \text{(resolved by randomization)}.
\end{cases}
```

This defines a **total strict order** on the set of bidders. Specifically:
- Bidders with higher prices are ranked higher.
- Bidders with equal prices are ranked based on randomization.
- $p_u^{(b)}$ is preserved.

<br>

------

<br>

Next: [FHE Precomputations](./2-FHE-Precomputations.md)
