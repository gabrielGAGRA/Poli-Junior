"""
Dado uma lista de strings `strs`, crie uma função `groupAnagram`, que recebe a lista de strings como parâmetro e agrupa os anagramas juntos. 
Você pode retornar a resposta em qualquer ordem.

### Exemplo 1:

Entrada: strs = ["eat", "tea", "tan", "ate", "nat", "bat"]

Saída: [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]

### Exemplo 2:

Entrada: strs = [""]
Saída: [[""]]

### Exemplo 3:

Entrada: strs = ["a"]

Saída: [["a"]]
"""
def groupAnagram(lst):
    len_lst = len(lst)
    for i in range(0, len_lst, i++):
        for j in range(i+1, len_lst, j++):
            palavra1= lst[i]
            palavra2= lst[j]
            if len(palavra1) == len(palavra2):
                anagrama = 1
                for letra1 in palavra1:
                    for k in range(0, len(palavra2), k++):
                        letra2 = palavra2[k]
                        if letra1 == letra2:
                            palavra2.remove(letra2)
                            break
                    anagrama = 0
                    break
                if anagrama == 1:
                    lista = ["[]", ]
                        
                    

strs = input("strs = ")
strs_lst = eval(strs)

groupAnagram(strs_lst)

"""checar se letra i eh igual a uma das letras da palavra
remover letra da palavra 2
aumentar contador j

se ao fim, achar todas letras e restar 0 letras na palavra 2 (len (2) = 0), eh anagrama
adicionar ao set e ao fim de todas palavras, imprimi-lo
remover palavras ja vistas
fazer o mesmo para proximas palavras: da 2 ao fim, da 3 ao fim

se ao fim, achar todas e restar letra, nao eh anagrama

se ao fim, nao achar todas, nao eh
"""
