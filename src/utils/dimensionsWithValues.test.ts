import { dimensionsWithValues } from './dimensionsWithValues';

describe('dimensionsWithValues', () => {
  it('passes on only the dimensions that have a value', () => {
    expect(
      dimensionsWithValues([
        { name: 'time', currentValue: undefined },
        { name: 'elevation', currentValue: '850', linked: true },
      ]),
    ).toEqual([{ name: 'elevation', currentValue: '850', linked: true }]);
  });
});
