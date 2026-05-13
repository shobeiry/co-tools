import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'rial',
  standalone: true
})
export class RialPipe implements PipeTransform {

  transform(value: number, n: number = 0): string {
    const re = '\\d(?=(\\d{3})+' + (n > 0 ? '\\.' : '$') + ')';
    return value.toFixed(Math.max(0, ~~n)).replace(new RegExp(re, 'g'), '$&,');
  }

}
